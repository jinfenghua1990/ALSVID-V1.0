import type { Clock } from '@alsvid/kernel';
import { systemClock } from '@alsvid/kernel';
import { Permission, type AuthContext } from '../core/auth.js';
import {
  EmailVerificationRateLimitError,
  IdentityMailUnavailableError,
  IdentityValidationError,
  PermissionDeniedError,
  InternalRegistrationDeniedError,
  InvalidCredentialsError,
  InvalidEmailCodeError,
  InvalidPasswordResetTokenError,
} from '../core/errors.js';
import { assertPermission } from '../core/permissions.js';
import type {
  IdentityAuditPort,
  IdentityRegistrationPolicy,
  IdentityRepository,
  IdentityVerificationDelivery,
  IdentityPasswordResetDelivery,
  OneTimeCodeService,
  PasswordHasher,
  SessionTokenService,
} from './ports.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export class IdentityService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly audit: IdentityAuditPort,
    private readonly passwords: PasswordHasher,
    private readonly codes: OneTimeCodeService,
    private readonly tokens: SessionTokenService,
    private readonly verificationDelivery: IdentityVerificationDelivery,
    private readonly passwordResetDelivery: IdentityPasswordResetDelivery,
    private readonly registrationPolicy: IdentityRegistrationPolicy,
    private readonly clock: Clock = systemClock,
  ) {}

  async supplierMembershipStatus(actor:AuthContext,userId:string,partnerId:string){
   if(!actor.roles.includes('system_admin')||!actor.permissions.includes('identity.role.manage'))
    throw new PermissionDeniedError('identity.role.manage');
   const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
   if(!uuid.test(userId)||!uuid.test(partnerId))throw new IdentityValidationError('Valid user and supplier Partner IDs required');
   const row=await this.repository.getSupplierMembership(userId,partnerId);
   return {userId,partnerId,status:row?.status??'UNASSIGNED',updatedAt:row?.updatedAt??null};
  }

  async manageSupplierMembership(actor:AuthContext,input:{
   userId:string;partnerId:string;status:'ACTIVE'|'DISABLED';evidenceRef:string;
  }):Promise<{userId:string;partnerId:string;status:'ACTIVE'|'DISABLED'}>{
   if(!actor.roles.includes('system_admin')||!actor.permissions.includes('identity.role.manage'))
    throw new PermissionDeniedError('identity.role.manage');
   const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
   if(!input||typeof input.userId!=='string'||!uuid.test(input.userId)
     ||typeof input.partnerId!=='string'||!uuid.test(input.partnerId)
     ||!['ACTIVE','DISABLED'].includes(input.status))
    throw new IdentityValidationError('Valid supplier member, Partner and status required');
   const evidence=typeof input.evidenceRef==='string'?input.evidenceRef.trim():'';
   if(evidence.length<8||evidence.length>200)
    throw new IdentityValidationError('Membership evidence reference must contain 8-200 characters');
   return this.repository.transaction(async e=>{
    if(!await this.repository.eligibleSupplierAccount(input.userId,e))
     throw new IdentityValidationError('Target user must be active and email verified');
    if(!await this.repository.eligibleSupplierPartner(input.partnerId,e))
     throw new IdentityValidationError('Partner must be active with SUPPLIER or FACTORY role');
    if(input.status==='ACTIVE')await this.repository.ensureUserRole(input.userId,'supplier_user',e);
    await this.repository.setSupplierMembership(input.userId,input.partnerId,input.status,evidence,actor.userId,e);
    await this.audit.record({actorUserId:actor.userId,action:'identity.supplier_membership_'+input.status.toLowerCase(),
      targetType:'supplier_membership',targetId:input.partnerId,metadata:{userId:input.userId,evidenceRef:evidence}},e);
    return {userId:input.userId,partnerId:input.partnerId,status:input.status};
   });
  }

  async bootstrapAdmin(email: string, password: string, displayName = 'ALSVID Administrator'): Promise<string> {
    const normalizedEmail = normalizeEmail(email);
    assertPasswordPolicy(password);
    const passwordHash = await this.passwords.hash(password);
    const verifiedAt = this.clock.now();
    return this.repository.transaction(async (executor) => {
      let userId = await this.repository.findUserIdByEmail(normalizedEmail, executor);
      if (userId) await this.repository.updateBootstrapUser(userId, cleanDisplayName(displayName, normalizedEmail), passwordHash, executor);
      else userId = await this.repository.createUser(normalizedEmail, cleanDisplayName(displayName, normalizedEmail), passwordHash, verifiedAt, executor);
      await this.repository.ensureUserRole(userId, 'internal_user', executor);
      await this.repository.ensureUserRole(userId, 'system_admin', executor);
      await this.audit.record({ action: 'identity.bootstrap_admin', targetType: 'user', targetId: userId }, executor);
      return userId;
    });
  }

  async registrationStatus(): Promise<{ emailVerificationAvailable: boolean; registrationMode: string; firstAdminRequired: boolean }> {
    return {
      emailVerificationAvailable: this.verificationDelivery.configured,
      registrationMode: this.registrationPolicy.registrationMode,
      firstAdminRequired: !(await this.repository.hasActiveSystemAdmin()),
    };
  }

  async startEmailVerification(email: string, audience: 'internal' | 'customer' = 'internal'): Promise<{ expiresAt: string; testCode?: string }> {
    if (!this.verificationDelivery.configured) throw new IdentityMailUnavailableError();
    const normalizedEmail = normalizeEmail(email);

    // Existing users may prove control of the exact email already stored on their
    // ALSVID account even when it predates the current company-domain policy.
    // Domain/invite policy applies only to creation of new Internal identities.
    const existingUserId = await this.repository.findUserIdByEmail(normalizedEmail);
    if (audience === 'internal' && !existingUserId) assertApprovedCompanyEmail(normalizedEmail, this.registrationPolicy.approvedEmailDomains);

    const firstAdminCandidate = audience === 'internal' && await this.isFirstAdminCandidate(normalizedEmail);
    if (audience === 'internal' && !existingUserId && this.registrationPolicy.registrationMode === 'invite_only' && !firstAdminCandidate) {
      if (!(await this.repository.hasValidRegistrationInvite(normalizedEmail))) throw new InternalRegistrationDeniedError();
    }

    const now = this.clock.now();
    const latest = await this.repository.findLatestEmailChallenge(normalizedEmail);
    if (latest && latest.createdAt.getTime() > now.getTime() - this.registrationPolicy.resendCooldownMs) {
      throw new EmailVerificationRateLimitError();
    }

    const code = this.codes.create();
    // Bind customer challenges to their audience; a My code cannot activate Internal registration.
    const codeHash = await this.codes.hash(audience === 'customer' ? 'customer:' + code : code);
    const expiresAt = new Date(now.getTime() + this.registrationPolicy.verificationTtlMs);
    const challengeId = await this.repository.transaction(async (executor) => {
      await this.repository.invalidateActiveEmailChallenges(normalizedEmail, executor);
      const id = await this.repository.createEmailChallenge(normalizedEmail, codeHash, expiresAt, this.registrationPolicy.maxVerificationAttempts, executor);
      await this.audit.record({ action: 'identity.email_verification_requested', targetType: 'email_verification', targetId: id, metadata: { email: normalizedEmail, existingUser: Boolean(existingUserId) } }, executor);
      return id;
    });

    try {
      await this.verificationDelivery.sendCode({ email: normalizedEmail, code, expiresAt });
    } catch {
      await this.repository.transaction(async (executor) => {
        await this.repository.consumeEmailChallenge(challengeId, executor);
        await this.audit.record({ action: 'identity.email_verification_delivery_failed', targetType: 'email_verification', targetId: challengeId, metadata: { email: normalizedEmail } }, executor);
      });
      throw new IdentityMailUnavailableError();
    }

    return {
      expiresAt: expiresAt.toISOString(),
      ...(this.registrationPolicy.exposeTestCode ? { testCode: code } : {}),
    };
  }

  async completeEmailVerification(email: string, code: string, displayName?: string, audience: 'internal' | 'customer' = 'internal'): Promise<{ token: string; expiresAt: string; user: AuthContext; firstAdminActivated: boolean }> {
    const normalizedEmail = normalizeEmail(email);
    if (!/^\d{6}$/.test(code.trim())) throw new InvalidEmailCodeError();

    const securityPolicy = await this.repository.getSecurityPolicy();
    const token = this.tokens.create();
    const tokenHash = this.tokens.hash(token);
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + securityPolicy.sessionTtlDays * DAY_MS);

    const result = await this.repository.transaction(async (executor) => {
      const challenge = await this.repository.findEmailChallengeForUpdate(normalizedEmail, executor);
      if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= now.getTime() || challenge.attempts >= challenge.maxAttempts) {
        if (challenge && !challenge.consumedAt) await this.repository.consumeEmailChallenge(challenge.id, executor);
        return { kind: 'invalid' as const };
      }

      const verified = await this.codes.verify(audience === 'customer' ? 'customer:' + code.trim() : code.trim(), challenge.codeHash);
      if (!verified) {
        await this.repository.incrementEmailChallengeAttempts(challenge.id, executor);
        await this.audit.record({ action: 'identity.email_verification_failed', targetType: 'email_verification', targetId: challenge.id, metadata: { email: normalizedEmail } }, executor);
        return { kind: 'invalid' as const };
      }

      let userId = await this.repository.findUserIdByEmail(normalizedEmail, executor);
      const isNewUser = !userId;
      const firstAdminCandidate = audience === 'internal' && !(await this.repository.hasActiveSystemAdmin(executor)) && this.registrationPolicy.initialAdminEmail === normalizedEmail;
      if (!userId) {
        if (audience === 'internal') assertApprovedCompanyEmail(normalizedEmail, this.registrationPolicy.approvedEmailDomains);
        const invited = audience === 'internal' && await this.repository.hasValidRegistrationInvite(normalizedEmail, executor);
        if (audience === 'internal' && this.registrationPolicy.registrationMode === 'invite_only' && !invited && !firstAdminCandidate) {
          await this.repository.consumeEmailChallenge(challenge.id, executor);
          await this.audit.record({ action: 'identity.internal_registration_denied', targetType: 'email_verification', targetId: challenge.id, metadata: { email: normalizedEmail } }, executor);
          return { kind: 'denied' as const };
        }
        userId = await this.repository.createUser(normalizedEmail, cleanDisplayName(displayName, normalizedEmail), null, now, executor);
        if (invited) await this.repository.consumeRegistrationInvite(normalizedEmail, executor);
        await this.audit.record({ actorUserId: userId, action: audience === 'customer' ? 'identity.customer_registered' : 'identity.internal_user_registered', targetType: 'user', targetId: userId }, executor);
      } else {
        await this.repository.markEmailVerified(userId, now, executor);
      }

      if (audience === 'customer') await this.repository.ensureUserRole(userId, 'customer_user', executor);
      else if (isNewUser || firstAdminCandidate) await this.repository.ensureUserRole(userId, 'internal_user', executor);
      // Existing customer identities never acquire Internal roles merely by selecting an Internal portal.
      let firstAdminActivated = false;
      if (firstAdminCandidate) {
        await this.repository.ensureUserRole(userId, 'system_admin', executor);
        firstAdminActivated = true;
        await this.audit.record({ actorUserId: userId, action: 'identity.first_admin_activated', targetType: 'user', targetId: userId }, executor);
      }

      await this.repository.consumeEmailChallenge(challenge.id, executor);
      await this.repository.createSession(userId, tokenHash, expiresAt, executor);
      await this.audit.record({ actorUserId: userId, action: 'identity.email_login', targetType: 'session' }, executor);
      const user = await this.repository.findUserContextById(userId, executor);
      if (!user) return { kind: 'denied' as const };
      return { kind: 'success' as const, user, firstAdminActivated };
    });

    if (result.kind === 'invalid') throw new InvalidEmailCodeError();
    if (result.kind === 'denied') throw new InternalRegistrationDeniedError();
    return { token, expiresAt: expiresAt.toISOString(), user: result.user, firstAdminActivated: result.firstAdminActivated };
  }

  /** Shared, atomic transport abuse limit for public authentication endpoints. */
  async consumePublicAuthRateLimit(bucket: string, windowMs: number, maximum: number): Promise<boolean> {
    return this.repository.consumeAuthRateLimit(this.tokens.hash(`public-auth:${bucket}`), windowMs, maximum);
  }

  async login(identifier: string, password: string): Promise<{ token: string; expiresAt: string; user: AuthContext }> {
    const normalizedIdentifier = normalizeLoginIdentifier(identifier);
    const allowed = await this.repository.consumeAuthRateLimit(this.tokens.hash(`login:${normalizedIdentifier}`), 15 * 60 * 1000, 5);
    if (!allowed) throw new InvalidCredentialsError();
    const row = await this.repository.findLoginContext(normalizedIdentifier);
    if (!row?.passwordHash || !(await this.passwords.verify(password, row.passwordHash))) throw new InvalidCredentialsError();
    const securityPolicy = await this.repository.getSecurityPolicy();
    const token = this.tokens.create();
    const expiresAt = new Date(this.clock.now().getTime() + securityPolicy.sessionTtlDays * DAY_MS);
    await this.repository.transaction(async (executor) => {
      await this.repository.createSession(row.userId, this.tokens.hash(token), expiresAt, executor);
      await this.audit.record({ actorUserId: row.userId, action: 'identity.login', targetType: 'session' }, executor);
    });
    const { passwordHash: _passwordHash, ...user } = row;
    return { token, expiresAt: expiresAt.toISOString(), user };
  }

  async setPassword(actor: AuthContext, password: string): Promise<void> {
    assertPasswordPolicy(password);
    const passwordHash = await this.passwords.hash(password);
    await this.repository.transaction(async (executor) => {
      await this.repository.setPasswordHash(actor.userId, passwordHash, executor);
      await this.audit.record({ actorUserId: actor.userId, action: 'identity.password_set', targetType: 'user', targetId: actor.userId, metadata: { completedRequiredSetup: Boolean(actor.passwordSetupRequired) } }, executor);
    });
  }

  async requestPasswordReset(email: string, resetUrlBase: string, portal?: string, locale?: string): Promise<void> {
    if (!this.passwordResetDelivery.configured) throw new IdentityMailUnavailableError();
    const normalizedEmail = normalizeEmail(email);
    const allowed = await this.repository.consumeAuthRateLimit(this.tokens.hash(`password-reset:${normalizedEmail}`), 60 * 60 * 1000, 3);
    if (!allowed) return;
    const user = await this.repository.findPasswordResetUser(normalizedEmail);
    if (!user) return;

    const token = this.tokens.create();
    const expiresAt = new Date(this.clock.now().getTime() + 30 * 60 * 1000);
    await this.repository.transaction(async (executor) => {
      await this.repository.createPasswordResetToken(user.userId, this.tokens.hash(token), expiresAt, executor);
      await this.audit.record({ action: 'identity.password_reset_requested', targetType: 'user', targetId: user.userId }, executor);
    });

    const resetUrl = new URL('/reset-password', resetUrlBase);
    resetUrl.searchParams.set('token', token);
    if (['admin', 'dealer', 'supplier', 'my'].includes(portal ?? '')) resetUrl.searchParams.set('portal', portal!);
    if (['zh', 'de', 'en'].includes(locale ?? '')) resetUrl.searchParams.set('locale', locale!);
    try {
      await this.passwordResetDelivery.sendResetEmail({ email: user.email, displayName: user.displayName, resetUrl: resetUrl.toString(), expiresAt });
    } catch {
      throw new IdentityMailUnavailableError();
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (!token.trim()) throw new InvalidPasswordResetTokenError();
    assertPasswordPolicy(password);
    const passwordHash = await this.passwords.hash(password);
    await this.repository.transaction(async (executor) => {
      const userId = await this.repository.resetPassword(this.tokens.hash(token.trim()), passwordHash, this.clock.now(), executor);
      if (!userId) throw new InvalidPasswordResetTokenError();
      await this.repository.revokeUserSessions(userId, executor);
      await this.audit.record({ action: 'identity.password_reset_completed', targetType: 'user', targetId: userId }, executor);
    });
  }

  async securityPolicy(actor: AuthContext): Promise<{ sessionTtlDays: number; forcePasswordSetup: boolean; riskStepUpEnabled: boolean; updatedAt: string }> {
    assertPermission(actor, Permission.IdentityRoleManage);
    const policy = await this.repository.getSecurityPolicy();
    return { sessionTtlDays: policy.sessionTtlDays, forcePasswordSetup: policy.forcePasswordSetup, riskStepUpEnabled: policy.riskStepUpEnabled, updatedAt: policy.updatedAt.toISOString() };
  }

  async updateSecurityPolicy(actor: AuthContext, input: { sessionTtlDays?: number; forcePasswordSetup?: boolean; riskStepUpEnabled?: boolean }): Promise<{ sessionTtlDays: number; forcePasswordSetup: boolean; riskStepUpEnabled: boolean; updatedAt: string }> {
    assertPermission(actor, Permission.IdentityRoleManage);
    const current = await this.repository.getSecurityPolicy();
    const sessionTtlDays = input.sessionTtlDays ?? current.sessionTtlDays;
    if (!Number.isInteger(sessionTtlDays) || sessionTtlDays < 1 || sessionTtlDays > 90) throw new IdentityValidationError('Session duration must be between 1 and 90 days');
    const forcePasswordSetup = input.forcePasswordSetup ?? current.forcePasswordSetup;
    const riskStepUpEnabled = input.riskStepUpEnabled ?? current.riskStepUpEnabled;
    if (typeof forcePasswordSetup !== 'boolean' || typeof riskStepUpEnabled !== 'boolean') throw new IdentityValidationError('Security policy values must be boolean');

    const updated = await this.repository.transaction(async (executor) => {
      const value = await this.repository.updateSecurityPolicy({ sessionTtlDays, forcePasswordSetup, riskStepUpEnabled, updatedBy: actor.userId }, executor);
      await this.audit.record({ actorUserId: actor.userId, action: 'identity.security_policy_updated', targetType: 'security_policy', targetId: 'default', metadata: { sessionTtlDays, forcePasswordSetup, riskStepUpEnabled } }, executor);
      return value;
    });
    return { sessionTtlDays: updated.sessionTtlDays, forcePasswordSetup: updated.forcePasswordSetup, riskStepUpEnabled: updated.riskStepUpEnabled, updatedAt: updated.updatedAt.toISOString() };
  }

  async createRegistrationInvite(actor: AuthContext, email: string, expiresInDays = 7): Promise<{ email: string; expiresAt: string }> {
    assertPermission(actor, Permission.IdentityRoleManage);
    const normalizedEmail = normalizeEmail(email);
    assertApprovedCompanyEmail(normalizedEmail, this.registrationPolicy.approvedEmailDomains);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) throw new IdentityValidationError('Invite expiry must be between 1 and 30 days');
    const expiresAt = new Date(this.clock.now().getTime() + expiresInDays * DAY_MS);
    await this.repository.transaction(async (executor) => {
      await this.repository.upsertRegistrationInvite(normalizedEmail, actor.userId, expiresAt, executor);
      await this.audit.record({ actorUserId: actor.userId, action: 'identity.registration_invite_created', targetType: 'registration_invite', targetId: normalizedEmail, metadata: { expiresAt: expiresAt.toISOString() } }, executor);
    });
    return { email: normalizedEmail, expiresAt: expiresAt.toISOString() };
  }

  async authenticate(token: string): Promise<AuthContext> {
    const tokenHash = this.tokens.hash(token);
    const row = await this.repository.findAuthenticatedContext(tokenHash);
    if (!row) throw new InvalidCredentialsError();
    await this.repository.touchSession(tokenHash);
    return row;
  }

  logout(token: string): Promise<void> { return this.repository.revokeSession(this.tokens.hash(token)); }

  async listUsers(actor: AuthContext): Promise<Array<AuthContext & { status: string }>> {
    assertPermission(actor, Permission.IdentityUserRead);
    return this.repository.listUsers();
  }

  async setUserRoles(actor: AuthContext, userId: string, roles: string[]): Promise<void> {
    assertPermission(actor, Permission.IdentityRoleManage);
    const distinctRoles = [...new Set(roles)];
    if (actor.userId === userId && actor.roles.includes('system_admin') && !distinctRoles.includes('system_admin')) throw new IdentityValidationError('A system administrator cannot remove their own system_admin role');
    await this.repository.transaction(async (executor) => {
      if (await this.repository.countKnownRoles(distinctRoles, executor) !== distinctRoles.length) throw new IdentityValidationError('Unknown role');
      await this.repository.replaceUserRoles(userId, distinctRoles, executor);
      await this.audit.record({ actorUserId: actor.userId, action: 'identity.roles_changed', targetType: 'user', targetId: userId, metadata: { roles: distinctRoles } }, executor);
    });
  }

  private async isFirstAdminCandidate(email: string): Promise<boolean> {
    return this.registrationPolicy.initialAdminEmail === email && !(await this.repository.hasActiveSystemAdmin());
  }
}

export function normalizeLoginIdentifier(identifier: string): string {
  const value = identifier.trim();
  if (value.includes('@')) return normalizeEmail(value);
  return normalizePhoneE164(value);
}

function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!value || !/^\S+@\S+\.\S+$/.test(value)) throw new IdentityValidationError('A valid email address is required');
  return value;
}

function normalizePhoneE164(phone: string): string {
  const value = phone.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new IdentityValidationError('A valid email address or E.164 phone number is required');
  return value;
}

function cleanDisplayName(displayName: string | undefined, email: string): string {
  const fallback = email.slice(0, email.indexOf('@')) || 'ALSVID User';
  const value = displayName?.trim() || fallback;
  return value.slice(0, 120);
}

function assertApprovedCompanyEmail(email: string, domains: readonly string[]): void {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const approved = domains.map((value) => value.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  if (!approved.length || !approved.includes(domain)) throw new InternalRegistrationDeniedError();
}

function assertPasswordPolicy(password: string): void {
  if (password.length < 8 || password.length > 128) throw new IdentityValidationError('Password must be between 8 and 128 characters');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new IdentityValidationError('Password must include at least one letter and one number');
}

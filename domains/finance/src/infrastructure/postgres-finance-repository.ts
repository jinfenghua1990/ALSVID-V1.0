import type { DatabasePort, QueryExecutor } from '@alsvid/database';
import type {
  FinanceRepository,
  NormalizedAllocationInput,
  NormalizedDocumentInput,
  NormalizedFxRateInput,
  NormalizedLandedAllocationInput,
  NormalizedLandedCostBatchInput,
  NormalizedLandedCostComponentInput,
  NormalizedLineInput,
  NormalizedObligationInput,
  NormalizedPaymentInput,
} from '../application/ports.js';

export class PostgresFinanceRepository implements FinanceRepository {
  constructor(private readonly database: DatabasePort) {}

  transaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }

  async summary(): Promise<any> {
    const [documents, lines, obligations, payments, allocations, fxRates, landedBatches, landedComponents, landedAllocations, partnerBalances, partners, purchaseOrders, commerceOrders, shipments, cargo, customsLines] = await Promise.all([
      this.database.query<any>(`SELECT d.*,p.partner_code,p.display_name AS partner_name FROM finance.documents d JOIN partners.partners p ON p.id=d.partner_id ORDER BY d.created_at DESC LIMIT 1000`),
      this.database.query<any>(`SELECT l.*,s.sku,sh.shipment_number FROM finance.document_lines l LEFT JOIN product.skus s ON s.id=l.sku_id LEFT JOIN logistics.shipments sh ON sh.id=l.shipment_id ORDER BY l.document_id,l.line_no`),
      this.database.query<any>(`SELECT o.*,p.partner_code,p.display_name AS partner_name,d.document_number,d.external_reference FROM finance.v_obligations o JOIN partners.partners p ON p.id=o.partner_id LEFT JOIN finance.documents d ON d.id=o.document_id ORDER BY o.created_at DESC LIMIT 1500`),
      this.database.query<any>(`SELECT p.*,pa.partner_code,pa.display_name AS partner_name FROM finance.v_payments p LEFT JOIN partners.partners pa ON pa.id=p.partner_id ORDER BY p.value_date DESC,p.created_at DESC LIMIT 1500`),
      this.database.query<any>(`SELECT a.*,p.payment_number,o.obligation_number,r.id AS reversal_id,r.reason AS reversal_reason FROM finance.allocations a JOIN finance.payments p ON p.id=a.payment_id JOIN finance.obligations o ON o.id=a.obligation_id LEFT JOIN finance.allocation_reversals r ON r.allocation_id=a.id ORDER BY a.allocated_at DESC LIMIT 3000`),
      this.database.query<any>(`SELECT * FROM finance.fx_rates ORDER BY effective_at DESC LIMIT 1000`),
      this.database.query<any>(`SELECT b.*,s.shipment_number,s.status AS shipment_status FROM finance.landed_cost_batches b JOIN logistics.shipments s ON s.id=b.shipment_id ORDER BY b.created_at DESC LIMIT 500`),
      this.database.query<any>(`SELECT c.*,d.document_number,cl.hs_code,cl.cn_code FROM finance.landed_cost_components c LEFT JOIN finance.documents d ON d.id=c.source_document_id LEFT JOIN logistics.customs_lines cl ON cl.id=c.source_customs_line_id ORDER BY c.created_at,c.id`),
      this.database.query<any>(`SELECT a.*,c.batch_id,sc.item_kind,sc.sku_id,sc.vehicle_id,s.sku,v.frame_number FROM finance.landed_cost_allocations a JOIN finance.landed_cost_components c ON c.id=a.component_id JOIN logistics.shipment_cargo sc ON sc.id=a.cargo_id LEFT JOIN product.skus s ON s.id=sc.sku_id LEFT JOIN vehicle.vehicles v ON v.id=sc.vehicle_id ORDER BY a.created_at,a.id`),
      this.database.query<any>(`SELECT b.*,p.partner_code,p.display_name AS partner_name FROM finance.v_partner_balances b JOIN partners.partners p ON p.id=b.partner_id ORDER BY lower(p.display_name),b.currency,b.direction`),
      this.database.query<any>(`SELECT p.id,p.partner_code,p.display_name,p.country_code,COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.enabled),ARRAY[]::text[]) AS roles FROM partners.partners p LEFT JOIN partners.roles r ON r.partner_id=p.id WHERE p.status='ACTIVE' GROUP BY p.id ORDER BY lower(p.display_name)`),
      this.database.query<any>(`SELECT po.id,po.po_number,po.supplier_partner_id,p.display_name AS supplier_name,po.currency,po.status,po.payment_terms,po.deposit_terms FROM procurement.purchase_orders po JOIN partners.partners p ON p.id=po.supplier_partner_id WHERE po.status<>'CANCELLED' ORDER BY po.created_at DESC LIMIT 1000`),
      this.database.query<any>(`SELECT o.id,o.external_order_id,o.external_order_name,o.customer_partner_id,o.dealer_partner_id,COALESCE(cp.display_name,dp.display_name) AS finance_partner_name,COALESCE(o.customer_partner_id,o.dealer_partner_id) AS finance_partner_id,o.currency,o.total_amount,o.financial_status,o.source_updated_at FROM commerce.external_orders o LEFT JOIN partners.partners cp ON cp.id=o.customer_partner_id LEFT JOIN partners.partners dp ON dp.id=o.dealer_partner_id ORDER BY o.updated_at DESC LIMIT 1000`),
      this.database.query<any>(`SELECT id,shipment_number,route_type,status FROM logistics.shipments ORDER BY created_at DESC LIMIT 1000`),
      this.database.query<any>(`SELECT c.id,c.shipment_id,c.item_kind,c.sku_id,c.vehicle_id,c.quantity,s.sku,v.frame_number FROM logistics.shipment_cargo c LEFT JOIN product.skus s ON s.id=c.sku_id LEFT JOIN vehicle.vehicles v ON v.id=c.vehicle_id ORDER BY c.created_at,c.id`),
      this.database.query<any>(`SELECT l.*,d.shipment_id,d.currency,d.declaration_code FROM logistics.customs_lines l JOIN logistics.customs_declarations d ON d.id=l.declaration_id ORDER BY l.created_at,l.id`),
    ]);
    return {
      documents: documents.rows,
      lines: lines.rows,
      obligations: obligations.rows,
      payments: payments.rows,
      allocations: allocations.rows,
      fxRates: fxRates.rows,
      landedBatches: landedBatches.rows,
      landedComponents: landedComponents.rows,
      landedAllocations: landedAllocations.rows,
      partnerBalances: partnerBalances.rows,
      references: { partners: partners.rows, purchaseOrders: purchaseOrders.rows, commerceOrders: commerceOrders.rows, shipments: shipments.rows, cargo: cargo.rows, customsLines: customsLines.rows },
    };
  }

  async createDocument(input: NormalizedDocumentInput, executor: QueryExecutor): Promise<any> {
    const result = await executor.query<any>(`INSERT INTO finance.documents(document_type,partner_id,external_reference,currency,issue_date,due_date,source_type,source_id,note,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`, [input.documentType,input.partnerId,input.externalReference?.trim()||null,input.currency,input.issueDate,input.dueDate||null,input.sourceType,input.sourceId,input.note?.trim()??'',input.actorUserId]);
    return result.rows[0];
  }

  async addDocumentLine(documentId: string, lineNo: number, input: NormalizedLineInput, executor: QueryExecutor): Promise<void> {
    await executor.query(`INSERT INTO finance.document_lines(document_id,line_no,category,description,quantity,unit,unit_price,net_amount,tax_amount,sku_id,shipment_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [documentId,lineNo,input.category,input.description?.trim()??'',input.quantity,input.unit,input.unitPrice,input.netAmount,input.taxAmount,input.skuId||null,input.shipmentId||null,JSON.stringify(input.metadata??{})]);
  }

  async refreshDocumentTotals(id: string, executor: QueryExecutor): Promise<any> {
    const result = await executor.query<any>(`UPDATE finance.documents d SET subtotal_amount=x.net,tax_amount=x.tax,total_amount=x.net+x.tax,updated_at=now() FROM (SELECT COALESCE(sum(net_amount),0)::numeric(20,6) AS net,COALESCE(sum(tax_amount),0)::numeric(20,6) AS tax FROM finance.document_lines WHERE document_id=$1) x WHERE d.id=$1 RETURNING d.*`, [id]);
    return result.rows[0];
  }

  async transitionDocument(id: string, version: number, status: 'VERIFIED' | 'DRAFT', actor: string): Promise<any | null> {
    const result = await this.database.query<any>(`UPDATE finance.documents SET status=$3,verified_at=CASE WHEN $3='VERIFIED' THEN now() ELSE NULL END,verified_by=CASE WHEN $3='VERIFIED' THEN $4::uuid ELSE NULL END,version=version+1,updated_by=$4,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`, [id,version,status,actor]);
    return result.rows[0] ?? null;
  }

  async voidDocument(id: string, version: number, reason: string, actor: string): Promise<any | null> {
    const result = await this.database.query<any>(`UPDATE finance.documents SET status='VOIDED',voided_at=now(),voided_by=$3,void_reason=$4,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND version=$2 AND status IN ('DRAFT','VERIFIED') RETURNING *`, [id,version,actor,reason]);
    return result.rows[0] ?? null;
  }

  async lockDocument(id: string, executor: QueryExecutor): Promise<any | null> {
    const result = await executor.query<any>(`SELECT * FROM finance.documents WHERE id=$1 FOR UPDATE`, [id]);
    return result.rows[0] ?? null;
  }

  async postDocument(id: string, version: number, actor: string, executor: QueryExecutor): Promise<any | null> {
    const result = await executor.query<any>(`UPDATE finance.documents SET status='POSTED',posted_at=now(),posted_by=$3,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND version=$2 AND status='VERIFIED' RETURNING *`, [id,version,actor]);
    return result.rows[0] ?? null;
  }

  async createObligation(input: NormalizedObligationInput, executor: QueryExecutor = this.database): Promise<any> {
    const result = await executor.query<any>(`INSERT INTO finance.obligations(direction,partner_id,document_id,currency,original_amount,due_date,source_type,source_id,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [input.direction,input.partnerId,input.documentId??null,input.currency,input.amount,input.dueDate||null,input.sourceType,input.sourceId,input.note?.trim()??'',input.actorUserId]);
    return result.rows[0];
  }

  async voidObligation(id: string, reason: string, actor: string): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.obligation_voids(obligation_id,reason,voided_by) VALUES ($1,$2,$3) RETURNING *`, [id,reason,actor])).rows[0];
  }

  async createPayment(input: NormalizedPaymentInput): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.payments(direction,partner_id,currency,amount,value_date,provider,account_reference,external_reference,idempotency_key,note,posted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [input.direction,input.partnerId||null,input.currency,input.amount,input.valueDate,input.provider?.trim()||'MANUAL',input.accountReference?.trim()||null,input.externalReference?.trim()||null,input.idempotencyKey,input.note?.trim()??'',input.actorUserId])).rows[0];
  }

  async reversePayment(id: string, reason: string, actor: string): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.payment_reversals(payment_id,reason,reversed_by) VALUES ($1,$2,$3) RETURNING *`, [id,reason,actor])).rows[0];
  }

  async createFxRate(input: NormalizedFxRateInput): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.fx_rates(base_currency,quote_currency,rate,effective_at,source,external_reference,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.baseCurrency,input.quoteCurrency,input.rate,input.effectiveAt,input.source,input.externalReference?.trim()||null,input.actorUserId])).rows[0];
  }

  async allocatePayment(input: NormalizedAllocationInput): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.allocations(payment_id,obligation_id,payment_amount,obligation_amount,fx_rate_id,note,allocated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.paymentId,input.obligationId,input.paymentAmount,input.obligationAmount,input.fxRateId||null,input.note?.trim()??'',input.actorUserId])).rows[0];
  }

  async reverseAllocation(id: string, reason: string, actor: string): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.allocation_reversals(allocation_id,reason,reversed_by) VALUES ($1,$2,$3) RETURNING *`, [id,reason,actor])).rows[0];
  }

  async createLandedCostBatch(input: NormalizedLandedCostBatchInput): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.landed_cost_batches(shipment_id,currency,allocation_basis,note,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.shipmentId,input.currency,input.allocationBasis,input.note?.trim()??'',input.actorUserId])).rows[0];
  }

  async addLandedCostComponent(batchId: string, input: NormalizedLandedCostComponentInput): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.landed_cost_components(batch_id,category,amount,currency,batch_currency_amount,fx_rate_id,source_document_id,source_customs_line_id,capitalizable,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [batchId,input.category,input.amount,input.currency,input.batchCurrencyAmount,input.fxRateId||null,input.sourceDocumentId||null,input.sourceCustomsLineId||null,input.capitalizable??true,input.note?.trim()??'',input.actorUserId])).rows[0];
  }

  async allocateLandedCost(componentId: string, input: NormalizedLandedAllocationInput): Promise<any> {
    return (await this.database.query<any>(`INSERT INTO finance.landed_cost_allocations(component_id,cargo_id,basis_value,allocated_amount,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [componentId,input.cargoId,input.basisValue,input.allocatedAmount,input.actorUserId])).rows[0];
  }

  async distributeLandedCost(batchId:string,input:{category:string;amountCents:number;note?:string;actorUserId:string}):Promise<any>{
    return this.transaction(async e=>{
      const batch=(await e.query<{id:string;shipment_id:string;currency:string;status:string}>(`SELECT id,shipment_id,currency,status FROM finance.landed_cost_batches WHERE id=$1 FOR UPDATE`,[batchId])).rows[0];
      if(!batch||batch.status!=='DRAFT')throw new Error('Landed cost batch must be draft');
      const cargo=(await e.query<{id:string;quantity:string}>(`SELECT id,quantity::text FROM logistics.shipment_cargo WHERE shipment_id=$1 ORDER BY created_at,id FOR UPDATE`,[batch.shipment_id])).rows;
      if(!cargo.length)throw new Error('Shipment has no allocated goods to distribute cost');
      const weight=cargo.map(x=>Number(x.quantity));
      if(weight.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Invalid cargo quantity');
      const total=weight.reduce((a,b)=>a+b,0);
      let centsUsed=0;
      const component=(await e.query<{id:string}>(`INSERT INTO finance.landed_cost_components(batch_id,category,amount,currency,batch_currency_amount,capitalizable,note,created_by)
        VALUES ($1,$2,$3,$4,$3,$5,$6,$7) RETURNING id`,[
        batchId,input.category,(input.amountCents/100).toFixed(2),batch.currency,input.category!=='IMPORT_VAT',input.note?.trim()??'',input.actorUserId
      ])).rows[0];
      if(!component)throw new Error('Cost component insertion failed');
      for(let i=0;i<cargo.length;i++){
        const row=cargo[i]!;
        const cents=i===cargo.length-1?input.amountCents-centsUsed:Math.round(input.amountCents*(weight[i]??0)/total);
        centsUsed+=cents;
        await e.query(`INSERT INTO finance.landed_cost_allocations(component_id,cargo_id,basis_value,allocated_amount,created_by) VALUES ($1,$2,$3,$4,$5)`,[component.id,row.id,row.quantity,(cents/100).toFixed(2),input.actorUserId]);
      }
      return {componentId:component.id,currency:batch.currency,allocationLines:cargo.length,amount:(input.amountCents/100).toFixed(2)};
    });
  }

  async finalizeLandedCostBatch(id: string, actor: string): Promise<any | null> {
    const result = await this.database.query<any>(`UPDATE finance.landed_cost_batches SET status='FINALIZED',finalized_at=now(),finalized_by=$2 WHERE id=$1 AND status='DRAFT' RETURNING *`, [id,actor]);
    return result.rows[0] ?? null;
  }
}

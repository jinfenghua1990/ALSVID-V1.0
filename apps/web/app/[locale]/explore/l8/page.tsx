import { notFound, permanentRedirect } from "next/navigation";
import { isLocale } from "../../../_lib/i18n/routing";
type Props = { params: Promise<{locale:string}> };
/** Legacy L8 link, now canonical L1. */
export default async function LegacyL8Page({params}:Props){
  const {locale}=await params;
  if(!isLocale(locale))notFound();
  permanentRedirect(`/${locale}/explore/l1`);
}

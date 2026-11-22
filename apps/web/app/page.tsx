import HomePage from "@/components/home";
import { featuredCatalog } from "@/lib/catalog-server";

export default async function Page() {
  const featured = await featuredCatalog();
  return <HomePage featured={featured || undefined} />;
}

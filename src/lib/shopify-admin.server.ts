const API_VERSION = "2025-07";

function shopDomain() {
  const d = process.env.SHOPIFY_STORE_PERMANENT_DOMAIN || "kasr-zero-mg.myshopify.com";
  return d;
}

export async function adminGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ACCESS_TOKEN is not configured");

  const url = `https://${shopDomain()}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Admin API ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as any;
  if (json.errors) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 500)}`);
  }
  return json.data as T;
}

let cachedLocationId: string | null = null;
export async function getPrimaryLocationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;
  const data = await adminGraphQL<{ locations: { edges: Array<{ node: { id: string } }> } }>(
    `query { locations(first: 1) { edges { node { id } } } }`,
  );
  const id = data.locations.edges[0]?.node?.id;
  if (!id) throw new Error("No Shopify location found");
  cachedLocationId = id;
  return id;
}

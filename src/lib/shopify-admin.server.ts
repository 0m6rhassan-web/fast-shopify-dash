const API_VERSION = "2025-07";
const SHOPIFY_STOREFRONT_TOKEN =
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || "e3ab8c4c1e66bf32cdcfb396bab113ab";

function shopDomain() {
  const d = process.env.SHOPIFY_STORE_PERMANENT_DOMAIN || "kasr-zero-mg.myshopify.com";
  return d;
}

function resolveToken(): string | undefined {
  // Prefer per-user online access token (issued via Shopify OAuth), fallback to app token.
  const onlineKey = Object.keys(process.env).find((k) => k.startsWith("SHOPIFY_ONLINE_ACCESS_TOKEN"));
  if (onlineKey && process.env[onlineKey]) return process.env[onlineKey];
  return process.env.SHOPIFY_ACCESS_TOKEN;
}

export async function adminGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const token = resolveToken();
  if (!token) throw new Error("Shopify access token is not configured");

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

export async function storefrontGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {},
): Promise<T> {
  const url = `https://${shopDomain()}/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Storefront API ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as any;
  if (json.errors) {
    throw new Error(`Shopify Storefront GraphQL: ${JSON.stringify(json.errors).slice(0, 500)}`);
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

import { createServerFn } from "@tanstack/react-start";

export type AdminProduct = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  status: string;
  featuredImage: string | null;
  totalInventory: number;
  variant: {
    id: string;
    sku: string | null;
    price: string;
    currencyCode: string;
    inventoryItemId: string | null;
    inventoryQuantity: number;
  } | null;
  variantCount: number;
};

const LIST_QUERY = /* GraphQL */ `
  query ListProducts($first: Int!, $query: String, $after: String) {
    products(first: $first, query: $query, after: $after, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          status
          totalInventory
          featuredImage { url altText }
          variants(first: 1) {
            edges {
              node {
                id
                sku
                price
                inventoryQuantity
                inventoryItem { id }
              }
            }
          }
          variantsCount { count }
          priceRangeV2 { minVariantPrice { currencyCode } }
        }
      }
    }
  }
`;

export const listProducts = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { search?: string; cursor?: string | null; limit?: number } | undefined) => data ?? {},
  )
  .handler(async ({ data }) => {
    const { adminGraphQL } = await import("./shopify-admin.server");
    const limit = Math.min(Math.max(data.limit ?? 25, 1), 50);
    const search = (data.search ?? "").trim();
    // Search by title OR sku
    let query: string | null = null;
    if (search) {
      const escaped = search.replace(/"/g, '\\"');
      query = `title:*${escaped}* OR sku:*${escaped}*`;
    }
    const res = await adminGraphQL<any>(LIST_QUERY, {
      first: limit,
      query,
      after: data.cursor ?? null,
    });
    const products: AdminProduct[] = res.products.edges.map((e: any) => {
      const v = e.node.variants.edges[0]?.node;
      return {
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        descriptionHtml: e.node.descriptionHtml ?? "",
        status: e.node.status,
        featuredImage: e.node.featuredImage?.url ?? null,
        totalInventory: e.node.totalInventory ?? 0,
        variantCount: e.node.variantsCount?.count ?? 0,
        variant: v
          ? {
              id: v.id,
              sku: v.sku ?? null,
              price: v.price,
              currencyCode: e.node.priceRangeV2?.minVariantPrice?.currencyCode ?? "USD",
              inventoryItemId: v.inventoryItem?.id ?? null,
              inventoryQuantity: v.inventoryQuantity ?? 0,
            }
          : null,
      };
    });
    return {
      products,
      pageInfo: res.products.pageInfo as { hasNextPage: boolean; endCursor: string | null },
    };
  });

const PRODUCT_UPDATE = /* GraphQL */ `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title descriptionHtml }
      userErrors { field message }
    }
  }
`;

const VARIANT_BULK_UPDATE = /* GraphQL */ `
  mutation VariantBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET = /* GraphQL */ `
  mutation InventorySet($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors { field message }
    }
  }
`;

export const updateProduct = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      productId: string;
      title?: string;
      descriptionHtml?: string;
      variantId?: string;
      price?: string;
      inventoryItemId?: string;
      inventoryQuantity?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { adminGraphQL, getPrimaryLocationId } = await import("./shopify-admin.server");

    // 1) Title / description
    if (data.title !== undefined || data.descriptionHtml !== undefined) {
      const input: Record<string, any> = { id: data.productId };
      if (data.title !== undefined) input.title = data.title;
      if (data.descriptionHtml !== undefined) input.descriptionHtml = data.descriptionHtml;
      const r = await adminGraphQL<any>(PRODUCT_UPDATE, { input });
      const errs = r.productUpdate?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
    }

    // 2) Price (variant)
    if (data.price !== undefined && data.variantId) {
      const r = await adminGraphQL<any>(VARIANT_BULK_UPDATE, {
        productId: data.productId,
        variants: [{ id: data.variantId, price: data.price }],
      });
      const errs = r.productVariantsBulkUpdate?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
    }

    // 3) Inventory
    if (data.inventoryQuantity !== undefined && data.inventoryItemId) {
      const locationId = await getPrimaryLocationId();
      const r = await adminGraphQL<any>(INVENTORY_SET, {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId: data.inventoryItemId,
              locationId,
              quantity: Math.max(0, Math.floor(data.inventoryQuantity)),
            },
          ],
        },
      });
      const errs = r.inventorySetQuantities?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
    }

    return { ok: true };
  });

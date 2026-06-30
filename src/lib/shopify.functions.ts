import { createServerFn } from "@tanstack/react-start";

export type AdminVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number;
};

export type AdminProduct = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  featuredImage: string | null;
  totalInventory: number;
  currencyCode: string;
  variants: AdminVariant[];
  variantCount: number;
};

const LIST_QUERY = /* GraphQL */ `
  query ListProducts($first: Int!, $query: String, $after: String) {
    products(first: $first, query: $query, after: $after, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title handle descriptionHtml status vendor productType tags
          seo { title description }
          totalInventory
          featuredImage { url altText }
          variants(first: 50) {
            edges {
              node {
                id title sku price compareAtPrice inventoryQuantity
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

function mapProduct(node: any): AdminProduct {
  const variants: AdminVariant[] = (node.variants?.edges ?? []).map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    sku: e.node.sku ?? null,
    price: e.node.price,
    compareAtPrice: e.node.compareAtPrice ?? null,
    inventoryItemId: e.node.inventoryItem?.id ?? null,
    inventoryQuantity: e.node.inventoryQuantity ?? 0,
  }));
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    descriptionHtml: node.descriptionHtml ?? "",
    status: node.status,
    vendor: node.vendor ?? "",
    productType: node.productType ?? "",
    tags: node.tags ?? [],
    seoTitle: node.seo?.title ?? "",
    seoDescription: node.seo?.description ?? "",
    featuredImage: node.featuredImage?.url ?? null,
    totalInventory: node.totalInventory ?? 0,
    currencyCode: node.priceRangeV2?.minVariantPrice?.currencyCode ?? "USD",
    variants,
    variantCount: node.variantsCount?.count ?? variants.length,
  };
}

export const listProducts = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { search?: string; cursor?: string | null; limit?: number } | undefined) => data ?? {},
  )
  .handler(async ({ data }) => {
    const { adminGraphQL } = await import("./shopify-admin.server");
    const limit = Math.min(Math.max(data.limit ?? 25, 1), 50);
    const search = (data.search ?? "").trim();
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
    const products: AdminProduct[] = res.products.edges.map((e: any) => mapProduct(e.node));
    return {
      products,
      pageInfo: res.products.pageInfo as { hasNextPage: boolean; endCursor: string | null },
    };
  });

const PRODUCT_UPDATE = /* GraphQL */ `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
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
    inventorySetQuantities(input: $input) { userErrors { field message } }
  }
`;

export type VariantUpdateInput = {
  id: string;
  price?: string;
  compareAtPrice?: string | null;
  sku?: string;
  inventoryItemId?: string;
  inventoryQuantity?: number;
};

export type ProductUpdateInput = {
  productId: string;
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  variants?: VariantUpdateInput[];
};

export const updateProduct = createServerFn({ method: "POST" })
  .inputValidator((data: ProductUpdateInput) => data)
  .handler(async ({ data }) => {
    const { adminGraphQL, getPrimaryLocationId } = await import("./shopify-admin.server");

    // 1) Product-level fields
    const hasProductFields =
      data.title !== undefined ||
      data.descriptionHtml !== undefined ||
      data.vendor !== undefined ||
      data.productType !== undefined ||
      data.status !== undefined ||
      data.tags !== undefined ||
      data.seoTitle !== undefined ||
      data.seoDescription !== undefined;

    if (hasProductFields) {
      const input: Record<string, any> = { id: data.productId };
      if (data.title !== undefined) input.title = data.title;
      if (data.descriptionHtml !== undefined) input.descriptionHtml = data.descriptionHtml;
      if (data.vendor !== undefined) input.vendor = data.vendor;
      if (data.productType !== undefined) input.productType = data.productType;
      if (data.status !== undefined) input.status = data.status;
      if (data.tags !== undefined) input.tags = data.tags;
      if (data.seoTitle !== undefined || data.seoDescription !== undefined) {
        input.seo = {
          ...(data.seoTitle !== undefined ? { title: data.seoTitle } : {}),
          ...(data.seoDescription !== undefined ? { description: data.seoDescription } : {}),
        };
      }
      const r = await adminGraphQL<any>(PRODUCT_UPDATE, { input });
      const errs = r.productUpdate?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
    }

    // 2) Variants (price / compareAtPrice / sku)
    const variantPayloads = (data.variants ?? [])
      .map((v) => {
        const o: any = { id: v.id };
        if (v.price !== undefined) o.price = v.price;
        if (v.compareAtPrice !== undefined) o.compareAtPrice = v.compareAtPrice;
        if (v.sku !== undefined) o.inventoryItem = { sku: v.sku };
        return Object.keys(o).length > 1 ? o : null;
      })
      .filter(Boolean);
    if (variantPayloads.length) {
      const r = await adminGraphQL<any>(VARIANT_BULK_UPDATE, {
        productId: data.productId,
        variants: variantPayloads,
      });
      const errs = r.productVariantsBulkUpdate?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
    }

    // 3) Inventory
    const invUpdates = (data.variants ?? []).filter(
      (v) => v.inventoryQuantity !== undefined && v.inventoryItemId,
    );
    if (invUpdates.length) {
      const locationId = await getPrimaryLocationId();
      const r = await adminGraphQL<any>(INVENTORY_SET, {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: invUpdates.map((v) => ({
            inventoryItemId: v.inventoryItemId!,
            locationId,
            quantity: Math.max(0, Math.floor(v.inventoryQuantity!)),
          })),
        },
      });
      const errs = r.inventorySetQuantities?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
    }

    return { ok: true };
  });

// ---------------- AI helpers ----------------

export type AISuggestion = {
  tags?: string[];
  title?: string;
  descriptionHtml?: string;
  seoTitle?: string;
  seoDescription?: string;
};

export const aiSuggest = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      productId: string;
      title: string;
      descriptionHtml: string;
      vendor?: string;
      productType?: string;
      currentTags?: string[];
      tasks: Array<"tags" | "content" | "seo">;
      language?: "ar" | "en";
    }) => data,
  )
  .handler(async ({ data }) => {
    const { generateText } = await import("ai");
    const { getGateway, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const gateway = getGateway();

    const lang = data.language ?? "ar";
    const tasksList = data.tasks.join(", ");
    const sys = `أنت مساعد محترف لتحسين بيانات منتجات Shopify. أعد فقط JSON صحيح بدون أي شرح أو markdown.`;
    const prompt = `حسّن المنتج التالي للمهام: ${tasksList}.
لغة المخرجات: ${lang === "ar" ? "العربية" : "English"}.

العنوان الحالي: ${data.title}
الوصف الحالي (HTML): ${data.descriptionHtml || "(فارغ)"}
المورد: ${data.vendor || "-"}
النوع: ${data.productType || "-"}
الوسوم الحالية: ${(data.currentTags ?? []).join(", ") || "(لا يوجد)"}

أعد JSON بهذا الشكل فقط (املأ المفاتيح المطلوبة حسب المهام):
{
  ${data.tasks.includes("tags") ? '"tags": ["tag1","tag2", ... 5-10 وسوم قصيرة بدون #],' : ""}
  ${data.tasks.includes("content") ? '"title": "عنوان محسّن قصير وجذاب", "descriptionHtml": "<p>وصف HTML احترافي 2-4 فقرات</p>",' : ""}
  ${data.tasks.includes("seo") ? '"seoTitle": "أقل من 60 حرف", "seoDescription": "أقل من 160 حرف"' : ""}
}`;

    const { text } = await generateText({
      model: gateway(DEFAULT_MODEL),
      system: sys,
      prompt,
    });

    // Extract JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("لم يرجع الذكاء الاصطناعي JSON صالح");
    let parsed: AISuggestion;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("فشل قراءة JSON من الذكاء الاصطناعي");
    }
    return { productId: data.productId, suggestion: parsed };
  });

// ---------------- CSV bulk match ----------------

export type CsvRow = Record<string, string>;
export type BulkSuggestion = {
  productId: string;
  productTitle: string;
  matchedBy: string;
  changes: {
    title?: string;
    descriptionHtml?: string;
    vendor?: string;
    productType?: string;
    tags?: string[];
    price?: string;
    inventoryQuantity?: number;
  };
};

export const matchCsvWithAI = createServerFn({ method: "POST" })
  .inputValidator((data: { csvText: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const Papa = (await import("papaparse")).default;
    const { generateText } = await import("ai");
    const { getGateway, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { adminGraphQL } = await import("./shopify-admin.server");

    const parsed = Papa.parse<CsvRow>(data.csvText, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = (parsed.data || []).slice(0, Math.min(data.limit ?? 50, 100));
    if (!rows.length) throw new Error("ملف CSV فارغ أو غير صالح");

    // Fetch a window of products (most recently updated) to match against
    const productsRes = await adminGraphQL<any>(
      `query($first:Int!){ products(first:$first, sortKey:UPDATED_AT, reverse:true){ edges{ node{ id title handle variants(first:1){ edges{ node{ sku } } } } } } }`,
      { first: 100 },
    );
    const catalog = productsRes.products.edges.map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      sku: e.node.variants.edges[0]?.node?.sku ?? "",
    }));

    const gateway = getGateway();
    const sys = `أنت أداة مطابقة. تلقَّى صفوف CSV وقائمة منتجات Shopify ثم أرجع JSON فقط بدون شرح.`;
    const prompt = `صفوف CSV (JSON):
${JSON.stringify(rows)}

كتالوج المنتجات (id, title, handle, sku):
${JSON.stringify(catalog)}

طابق كل صف بأنسب منتج (حسب SKU أو handle أو title) وحدّد التغييرات المقترحة.
أعد JSON بهذا الشكل فقط:
{
  "suggestions": [
    {
      "productId": "gid://...",
      "productTitle": "...",
      "matchedBy": "sku|title|handle",
      "changes": {
        "title": "...",
        "descriptionHtml": "...",
        "vendor": "...",
        "productType": "...",
        "tags": ["..."],
        "price": "10.00",
        "inventoryQuantity": 5
      }
    }
  ]
}
ضع داخل changes فقط الحقول التي تظهر فعلاً في صف CSV. تجاهل الصفوف التي لا يوجد لها تطابق واضح.`;

    const { text } = await generateText({
      model: gateway(DEFAULT_MODEL),
      system: sys,
      prompt,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("لم يرجع الذكاء الاصطناعي JSON صالح");
    let out: { suggestions: BulkSuggestion[] };
    try {
      out = JSON.parse(m[0]);
    } catch {
      throw new Error("فشل قراءة JSON من الذكاء الاصطناعي");
    }
    return {
      suggestions: out.suggestions ?? [],
      totalRows: rows.length,
      catalogSize: catalog.length,
    };
  });

// ---------------- Export / Import CSV (direct, no AI) ----------------

const CSV_HEADERS = [
  "product_id",
  "variant_id",
  "inventory_item_id",
  "handle",
  "title",
  "vendor",
  "product_type",
  "status",
  "tags",
  "seo_title",
  "seo_description",
  "description_html",
  "variant_title",
  "sku",
  "price",
  "compare_at_price",
  "inventory_quantity",
] as const;

export const exportProductsCsv = createServerFn({ method: "POST" })
  .inputValidator((data: { search?: string; max?: number } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const { adminGraphQL } = await import("./shopify-admin.server");
    const Papa = (await import("papaparse")).default;
    const max = Math.min(data.max ?? 500, 2000);
    const search = (data.search ?? "").trim();
    const query = search
      ? `title:*${search.replace(/"/g, '\\"')}* OR sku:*${search.replace(/"/g, '\\"')}*`
      : null;

    const rows: Record<string, string | number> [] = [];
    let after: string | null = null;
    while (rows.length < max) {
      const pageSize = Math.min(50, max - rows.length);
      const res = await adminGraphQL<any>(LIST_QUERY, { first: pageSize, query, after });
      for (const e of res.products.edges) {
        const p = mapProduct(e.node);
        if (p.variants.length === 0) {
          rows.push({
            product_id: p.id,
            variant_id: "",
            inventory_item_id: "",
            handle: p.handle,
            title: p.title,
            vendor: p.vendor,
            product_type: p.productType,
            status: p.status,
            tags: p.tags.join(", "),
            seo_title: p.seoTitle,
            seo_description: p.seoDescription,
            description_html: p.descriptionHtml,
            variant_title: "",
            sku: "",
            price: "",
            compare_at_price: "",
            inventory_quantity: "",
          });
        } else {
          for (const v of p.variants) {
            rows.push({
              product_id: p.id,
              variant_id: v.id,
              inventory_item_id: v.inventoryItemId ?? "",
              handle: p.handle,
              title: p.title,
              vendor: p.vendor,
              product_type: p.productType,
              status: p.status,
              tags: p.tags.join(", "),
              seo_title: p.seoTitle,
              seo_description: p.seoDescription,
              description_html: p.descriptionHtml,
              variant_title: v.title,
              sku: v.sku ?? "",
              price: v.price,
              compare_at_price: v.compareAtPrice ?? "",
              inventory_quantity: v.inventoryQuantity,
            });
          }
        }
      }
      if (!res.products.pageInfo.hasNextPage) break;
      after = res.products.pageInfo.endCursor;
    }

    const csv = Papa.unparse(rows, { columns: [...CSV_HEADERS] });
    return { csv, productCount: new Set(rows.map((r) => r.product_id)).size, rowCount: rows.length };
  });

type CsvUpdateRow = Record<string, string>;

export const applyCsvUpdates = createServerFn({ method: "POST" })
  .inputValidator((data: { csvText: string }) => data)
  .handler(async ({ data }) => {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse<CsvUpdateRow>(data.csvText, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = parsed.data ?? [];
    if (!rows.length) throw new Error("ملف CSV فارغ");

    // Group by product_id
    const byProduct = new Map<string, CsvUpdateRow[]>();
    for (const r of rows) {
      const pid = (r.product_id || "").trim();
      if (!pid) continue;
      const list = byProduct.get(pid) ?? [];
      list.push(r);
      byProduct.set(pid, list);
    }
    if (!byProduct.size) throw new Error("لا توجد صفوف صالحة (product_id مفقود)");

    const get = (r: CsvUpdateRow, k: string) =>
      r[k] !== undefined && r[k] !== null ? String(r[k]) : undefined;

    let ok = 0;
    let failed = 0;
    const errors: Array<{ productId: string; message: string }> = [];

    for (const [productId, group] of byProduct) {
      const first = group[0];
      const payload: ProductUpdateInput = { productId };

      const title = get(first, "title");
      if (title !== undefined && title !== "") payload.title = title;
      const desc = get(first, "description_html");
      if (desc !== undefined) payload.descriptionHtml = desc;
      const vendor = get(first, "vendor");
      if (vendor !== undefined) payload.vendor = vendor;
      const ptype = get(first, "product_type");
      if (ptype !== undefined) payload.productType = ptype;
      const status = get(first, "status");
      if (status && ["ACTIVE", "DRAFT", "ARCHIVED"].includes(status.toUpperCase())) {
        payload.status = status.toUpperCase() as any;
      }
      const tags = get(first, "tags");
      if (tags !== undefined) {
        payload.tags = tags.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const seoT = get(first, "seo_title");
      if (seoT !== undefined) payload.seoTitle = seoT;
      const seoD = get(first, "seo_description");
      if (seoD !== undefined) payload.seoDescription = seoD;

      const vChanges: VariantUpdateInput[] = [];
      for (const r of group) {
        const vid = get(r, "variant_id");
        if (!vid) continue;
        const ch: VariantUpdateInput = { id: vid };
        let changed = false;
        const price = get(r, "price");
        if (price) {
          ch.price = price;
          changed = true;
        }
        const cap = get(r, "compare_at_price");
        if (cap !== undefined) {
          ch.compareAtPrice = cap === "" ? null : cap;
          changed = true;
        }
        const sku = get(r, "sku");
        if (sku !== undefined) {
          ch.sku = sku;
          changed = true;
        }
        const qty = get(r, "inventory_quantity");
        const iid = get(r, "inventory_item_id");
        if (qty !== undefined && qty !== "" && iid) {
          const n = parseInt(qty, 10);
          if (!Number.isNaN(n)) {
            ch.inventoryQuantity = n;
            ch.inventoryItemId = iid;
            changed = true;
          }
        }
        if (changed) vChanges.push(ch);
      }
      if (vChanges.length) payload.variants = vChanges;

      try {
        // Reuse update logic via direct calls
        const { adminGraphQL, getPrimaryLocationId } = await import("./shopify-admin.server");
        const hasProductFields =
          payload.title !== undefined ||
          payload.descriptionHtml !== undefined ||
          payload.vendor !== undefined ||
          payload.productType !== undefined ||
          payload.status !== undefined ||
          payload.tags !== undefined ||
          payload.seoTitle !== undefined ||
          payload.seoDescription !== undefined;

        if (hasProductFields) {
          const input: Record<string, any> = { id: productId };
          if (payload.title !== undefined) input.title = payload.title;
          if (payload.descriptionHtml !== undefined) input.descriptionHtml = payload.descriptionHtml;
          if (payload.vendor !== undefined) input.vendor = payload.vendor;
          if (payload.productType !== undefined) input.productType = payload.productType;
          if (payload.status !== undefined) input.status = payload.status;
          if (payload.tags !== undefined) input.tags = payload.tags;
          if (payload.seoTitle !== undefined || payload.seoDescription !== undefined) {
            input.seo = {
              ...(payload.seoTitle !== undefined ? { title: payload.seoTitle } : {}),
              ...(payload.seoDescription !== undefined ? { description: payload.seoDescription } : {}),
            };
          }
          const r = await adminGraphQL<any>(PRODUCT_UPDATE, { input });
          const errs = r.productUpdate?.userErrors ?? [];
          if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
        }
        if (payload.variants?.length) {
          const variantPayloads = payload.variants
            .map((v) => {
              const o: any = { id: v.id };
              if (v.price !== undefined) o.price = v.price;
              if (v.compareAtPrice !== undefined) o.compareAtPrice = v.compareAtPrice;
              if (v.sku !== undefined) o.inventoryItem = { sku: v.sku };
              return Object.keys(o).length > 1 ? o : null;
            })
            .filter(Boolean);
          if (variantPayloads.length) {
            const r = await adminGraphQL<any>(VARIANT_BULK_UPDATE, {
              productId,
              variants: variantPayloads,
            });
            const errs = r.productVariantsBulkUpdate?.userErrors ?? [];
            if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
          }
          const invUpdates = payload.variants.filter(
            (v) => v.inventoryQuantity !== undefined && v.inventoryItemId,
          );
          if (invUpdates.length) {
            const locationId = await getPrimaryLocationId();
            const r = await adminGraphQL<any>(INVENTORY_SET, {
              input: {
                name: "available",
                reason: "correction",
                ignoreCompareQuantity: true,
                quantities: invUpdates.map((v) => ({
                  inventoryItemId: v.inventoryItemId!,
                  locationId,
                  quantity: Math.max(0, Math.floor(v.inventoryQuantity!)),
                })),
              },
            });
            const errs = r.inventorySetQuantities?.userErrors ?? [];
            if (errs.length) throw new Error(errs.map((e: any) => e.message).join(", "));
          }
        }
        ok++;
      } catch (e: any) {
        failed++;
        errors.push({ productId, message: e?.message ?? String(e) });
      }
    }

    return { ok, failed, total: byProduct.size, errors: errors.slice(0, 20) };
  });

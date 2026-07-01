import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Pencil,
  Search,
  ImageOff,
  Package,
  RefreshCw,
  Sparkles,
  Upload,
  Download,
  FileSpreadsheet,
  X,
  Check,
  Percent,
  Settings2,
  Tag,
  Trash2,
  Plus,
} from "lucide-react";

import {
  listProducts,
  updateProduct,
  aiSuggest,
  matchCsvWithAI,
  exportProductsCsv,
  applyCsvUpdates,
  listProductMetafields,
  saveProductMetafields,
  bulkAdjustPrices,
  previewSpecPricing,
  type AdminProduct,
  type AdminVariant,
  type ProductUpdateInput,
  type VariantUpdateInput,
  type BulkSuggestion,
  type ProductMetafield,
  type SpecRules,
} from "@/lib/shopify.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة تحكم المنتجات | Shopify Admin" },
      {
        name: "description",
        content: "إدارة منتجات Shopify: عرض، بحث، تعديل سريع لكل الحقول، ومساعد AI لتحسين البيانات.",
      },
    ],
  }),
  component: ProductsDashboard,
});

function useDebounced<T>(value: T, delay = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function ProductsDashboard() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 400);
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);

  const listFn = useServerFn(listProducts);
  const query = useQuery({
    queryKey: ["products", search],
    queryFn: () => listFn({ data: { search, limit: 50 } }),
    placeholderData: keepPreviousData,
  });

  const filtered = useMemo(() => {
    const items = query.data?.products ?? [];
    if (stockFilter === "all") return items;
    return items.filter((p) => {
      const q = p.totalInventory ?? 0;
      if (stockFilter === "out") return q <= 0;
      if (stockFilter === "low") return q > 0 && q <= 5;
      if (stockFilter === "in") return q > 5;
      return true;
    });
  }, [query.data, stockFilter]);

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <Toaster position="top-center" richColors />
      <header className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Package className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">لوحة تحكم المنتجات</h1>
              <p className="text-xs text-muted-foreground">إدارة منتجات Shopify مع مساعد AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="default" size="sm" onClick={() => setPricingOpen(true)}>
              <Percent className="size-4 ml-2" />
              أدوات التسعير
            </Button>
            <Button variant="default" size="sm" onClick={() => setSheetOpen(true)}>
              <FileSpreadsheet className="size-4 ml-2" />
              شيت التعديلات
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <Sparkles className="size-4 ml-2" />
              AI من CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={`size-4 ml-2 ${query.isFetching ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">البحث والفلترة</CardTitle>
            <CardDescription>ابحث بالاسم أو الـ SKU، وفلتر حسب حالة المخزون</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ابحث بالاسم أو SKU..."
                className="pr-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: "الكل" },
                  { key: "in", label: "متوفر" },
                  { key: "low", label: "كمية منخفضة" },
                  { key: "out", label: "نفذ" },
                ] as const
              ).map((f) => (
                <Button
                  key={f.key}
                  variant={stockFilter === f.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStockFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="py-20 grid place-items-center text-muted-foreground">
                <Loader2 className="size-6 animate-spin mb-2" />
                جاري تحميل المنتجات...
              </div>
            ) : query.isError ? (
              <div className="py-20 text-center text-destructive">
                <p className="font-medium">تعذّر تحميل المنتجات</p>
                <p className="text-sm mt-1">{(query.error as Error).message}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">لا توجد منتجات مطابقة.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المنتج</TableHead>
                      <TableHead className="text-right">SKU</TableHead>
                      <TableHead className="text-right">السعر</TableHead>
                      <TableHead className="text-right">المخزن</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <ProductRow key={p.id} product={p} onEdit={() => setEditing(p)} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          {query.data?.products.length ?? 0} منتج معروض
          {query.data?.pageInfo.hasNextPage ? " (هناك المزيد...)" : ""}
        </p>
      </main>

      <EditDialog product={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <BulkAiDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <SheetDialog open={sheetOpen} onOpenChange={setSheetOpen} />
      <PricingToolsDialog open={pricingOpen} onOpenChange={setPricingOpen} />
    </div>
  );
}

function ProductRow({ product, onEdit }: { product: AdminProduct; onEdit: () => void }) {
  const qty = product.totalInventory ?? 0;
  const v = product.variants[0];
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-md bg-muted overflow-hidden grid place-items-center shrink-0">
            {product.featuredImage ? (
              <img src={product.featuredImage} alt={product.title} className="size-full object-cover" />
            ) : (
              <ImageOff className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate max-w-[280px]">{product.title}</p>
            <p className="text-xs text-muted-foreground truncate">/{product.handle}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{v?.sku || "—"}</TableCell>
      <TableCell className="font-medium tabular-nums">
        {v ? `${v.price} ${product.currencyCode}` : "—"}
      </TableCell>
      <TableCell className="tabular-nums">
        <span className={qty <= 0 ? "text-destructive font-medium" : ""}>{qty}</span>
        {product.variantCount > 1 && (
          <span className="text-xs text-muted-foreground mr-2">({product.variantCount} متغيرات)</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={product.status === "ACTIVE" ? "default" : "secondary"}>
          {product.status === "ACTIVE" ? "نشط" : product.status === "DRAFT" ? "مسودة" : "مؤرشف"}
        </Badge>
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-3.5 ml-1.5" />
          تعديل سريع
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ---------------- Edit Dialog ----------------

function EditDialog({
  product,
  onOpenChange,
}: {
  product: AdminProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateProduct);
  const aiFn = useServerFn(aiSuggest);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [productType, setProductType] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT" | "ARCHIVED">("ACTIVE");
  const [tagsStr, setTagsStr] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [variants, setVariants] = useState<AdminVariant[]>([]);
  const [aiBusy, setAiBusy] = useState<null | "tags" | "content" | "seo">(null);

  useEffect(() => {
    if (product) {
      setTitle(product.title);
      setDescription(product.descriptionHtml ?? "");
      setVendor(product.vendor ?? "");
      setProductType(product.productType ?? "");
      setStatus((product.status as any) ?? "ACTIVE");
      setTagsStr((product.tags ?? []).join(", "));
      setSeoTitle(product.seoTitle ?? "");
      setSeoDesc(product.seoDescription ?? "");
      setVariants(product.variants.map((v) => ({ ...v })));
    }
  }, [product]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("لا يوجد منتج");
      const payload: ProductUpdateInput = { productId: product.id };
      const origTags = (product.tags ?? []).join(", ");
      if (title !== product.title) payload.title = title;
      if (description !== (product.descriptionHtml ?? "")) payload.descriptionHtml = description;
      if (vendor !== (product.vendor ?? "")) payload.vendor = vendor;
      if (productType !== (product.productType ?? "")) payload.productType = productType;
      if (status !== product.status) payload.status = status;
      if (tagsStr !== origTags) {
        payload.tags = tagsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (seoTitle !== (product.seoTitle ?? "")) payload.seoTitle = seoTitle;
      if (seoDesc !== (product.seoDescription ?? "")) payload.seoDescription = seoDesc;

      const vChanges: VariantUpdateInput[] = [];
      for (const v of variants) {
        const orig = product.variants.find((o) => o.id === v.id);
        if (!orig) continue;
        const ch: VariantUpdateInput = { id: v.id };
        let changed = false;
        if (v.price !== orig.price) {
          ch.price = v.price;
          changed = true;
        }
        if ((v.sku ?? "") !== (orig.sku ?? "")) {
          ch.sku = v.sku ?? "";
          changed = true;
        }
        if ((v.compareAtPrice ?? "") !== (orig.compareAtPrice ?? "")) {
          ch.compareAtPrice = v.compareAtPrice || null;
          changed = true;
        }
        if (v.inventoryQuantity !== orig.inventoryQuantity && v.inventoryItemId) {
          ch.inventoryItemId = v.inventoryItemId;
          ch.inventoryQuantity = v.inventoryQuantity;
          changed = true;
        }
        if (changed) vChanges.push(ch);
      }
      if (vChanges.length) payload.variants = vChanges;

      return updateFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم حفظ التعديلات في Shopify");
      qc.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error("فشل الحفظ", { description: err.message }),
  });

  const runAi = async (task: "tags" | "content" | "seo") => {
    if (!product) return;
    setAiBusy(task);
    try {
      const res = await aiFn({
        data: {
          productId: product.id,
          title,
          descriptionHtml: description,
          vendor,
          productType,
          currentTags: tagsStr.split(",").map((s) => s.trim()).filter(Boolean),
          tasks: [task],
          language: "ar",
        },
      });
      const s = res.suggestion;
      if (task === "tags" && s.tags?.length) {
        setTagsStr(s.tags.join(", "));
        toast.success("تم اقتراح وسوم — راجعها قبل الحفظ");
      } else if (task === "content") {
        if (s.title) setTitle(s.title);
        if (s.descriptionHtml) setDescription(s.descriptionHtml);
        toast.success("تم تحسين النصوص — راجعها قبل الحفظ");
      } else if (task === "seo") {
        if (s.seoTitle) setSeoTitle(s.seoTitle);
        if (s.seoDescription) setSeoDesc(s.seoDescription);
        toast.success("تم تحسين SEO — راجعها قبل الحفظ");
      }
    } catch (e: any) {
      toast.error("فشل AI", { description: e?.message });
    } finally {
      setAiBusy(null);
    }
  };

  const updateVariant = (id: string, patch: Partial<AdminVariant>) => {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل سريع</DialogTitle>
          <DialogDescription>
            عدّل أي حقل ثم احفظ — التغييرات تُرسل مباشرة إلى Shopify.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-2">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="basic">الأساسي</TabsTrigger>
            <TabsTrigger value="variants">
              المتغيرات {variants.length > 1 ? `(${variants.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="tags">Tags &amp; بيانات</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="meta">Metafields</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">العنوان</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runAi("content")}
                  disabled={aiBusy !== null}
                >
                  {aiBusy === "content" ? (
                    <Loader2 className="size-3.5 animate-spin ml-1" />
                  ) : (
                    <Sparkles className="size-3.5 ml-1" />
                  )}
                  تحسين بـ AI
                </Button>
              </div>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">الوصف (HTML)</Label>
              <Textarea
                id="desc"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">نشط</SelectItem>
                    <SelectItem value="DRAFT">مسودة</SelectItem>
                    <SelectItem value="ARCHIVED">مؤرشف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor">المورد</Label>
                <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ptype">النوع</Label>
                <Input
                  id="ptype"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="variants" className="mt-4">
            {variants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد متغيرات.</p>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المتغير</TableHead>
                      <TableHead className="text-right">SKU</TableHead>
                      <TableHead className="text-right">السعر</TableHead>
                      <TableHead className="text-right">قبل الخصم</TableHead>
                      <TableHead className="text-right">المخزن</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-sm">{v.title}</TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={v.sku ?? ""}
                            onChange={(e) => updateVariant(v.id, { sku: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-24"
                            value={v.price}
                            onChange={(e) => updateVariant(v.id, { price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-24"
                            value={v.compareAtPrice ?? ""}
                            onChange={(e) =>
                              updateVariant(v.id, { compareAtPrice: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-20"
                            type="number"
                            value={v.inventoryQuantity}
                            disabled={!v.inventoryItemId}
                            onChange={(e) =>
                              updateVariant(v.id, {
                                inventoryQuantity: parseInt(e.target.value || "0", 10),
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tags" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tags">الوسوم (مفصولة بفاصلة)</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runAi("tags")}
                  disabled={aiBusy !== null}
                >
                  {aiBusy === "tags" ? (
                    <Loader2 className="size-3.5 animate-spin ml-1" />
                  ) : (
                    <Sparkles className="size-3.5 ml-1" />
                  )}
                  توليد Tags بـ AI
                </Button>
              </div>
              <Textarea
                id="tags"
                rows={3}
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tagsStr
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t, i) => (
                    <Badge key={i} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="seo" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => runAi("seo")}
                disabled={aiBusy !== null}
              >
                {aiBusy === "seo" ? (
                  <Loader2 className="size-3.5 animate-spin ml-1" />
                ) : (
                  <Sparkles className="size-3.5 ml-1" />
                )}
                تحسين SEO بـ AI
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo-t">عنوان SEO</Label>
              <Input
                id="seo-t"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                maxLength={70}
              />
              <p className="text-xs text-muted-foreground">{seoTitle.length}/60 حرف</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo-d">وصف SEO</Label>
              <Textarea
                id="seo-d"
                rows={3}
                value={seoDesc}
                onChange={(e) => setSeoDesc(e.target.value)}
                maxLength={170}
              />
              <p className="text-xs text-muted-foreground">{seoDesc.length}/160 حرف</p>
            </div>
          </TabsContent>

          <TabsContent value="meta" className="mt-4">
            {product && <MetafieldsPanel productId={product.id} />}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin ml-2" />}
            حفظ في Shopify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Bulk AI from CSV ----------------

function BulkAiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const matchFn = useServerFn(matchCsvWithAI);
  const updateFn = useServerFn(updateProduct);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [suggestions, setSuggestions] = useState<BulkSuggestion[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) {
      setCsvText("");
      setSuggestions([]);
      setSelected({});
    }
  }, [open]);

  const analyze = useMutation({
    mutationFn: async () => matchFn({ data: { csvText, limit: 50 } }),
    onSuccess: (res) => {
      setSuggestions(res.suggestions);
      const sel: Record<string, boolean> = {};
      res.suggestions.forEach((s, i) => (sel[String(i)] = true));
      setSelected(sel);
      toast.success(`AI اقترح ${res.suggestions.length} تحديث من أصل ${res.totalRows} صف`);
    },
    onError: (e: Error) => toast.error("فشل التحليل", { description: e.message }),
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
  };

  const applyAll = async () => {
    setApplying(true);
    let ok = 0,
      fail = 0;
    for (let i = 0; i < suggestions.length; i++) {
      if (!selected[String(i)]) continue;
      const s = suggestions[i];
      const c = s.changes;
      const payload: ProductUpdateInput = { productId: s.productId };
      if (c.title !== undefined) payload.title = c.title;
      if (c.descriptionHtml !== undefined) payload.descriptionHtml = c.descriptionHtml;
      if (c.vendor !== undefined) payload.vendor = c.vendor;
      if (c.productType !== undefined) payload.productType = c.productType;
      if (c.tags !== undefined) payload.tags = c.tags;
      // price / inventory need a variant — we'd need to fetch; skip if not provided per-variant
      try {
        await updateFn({ data: payload });
        ok++;
      } catch {
        fail++;
      }
    }
    setApplying(false);
    toast.success(`تم تطبيق ${ok} تحديث${fail ? ` — فشل ${fail}` : ""}`);
    qc.invalidateQueries({ queryKey: ["products"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تحديث جماعي بـ AI</DialogTitle>
          <DialogDescription>
            ارفع ملف CSV، الذكاء الاصطناعي يطابقه بمنتجاتك ويقترح التعديلات — راجعها قبل الحفظ.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <div className="space-y-4 py-2">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
            >
              <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">اضغط لاختيار ملف CSV أو اسحبه هنا</p>
              <p className="text-xs text-muted-foreground mt-1">
                يجب أن يحتوي على عمود title أو sku للمطابقة
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </div>
            {csvText && (
              <div className="space-y-2">
                <Label>معاينة الملف (أول 500 حرف)</Label>
                <Textarea readOnly rows={6} value={csvText.slice(0, 500)} className="font-mono text-xs" />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button onClick={() => analyze.mutate()} disabled={!csvText || analyze.isPending}>
                {analyze.isPending && <Loader2 className="size-4 animate-spin ml-2" />}
                <Sparkles className="size-4 ml-2" />
                حلّل بـ AI
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              راجع الاقتراحات أدناه. ألغِ تحديد ما لا تريد تطبيقه.
            </p>
            <div className="border rounded-md max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-10"></TableHead>
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right">التغييرات المقترحة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s, i) => {
                    const c = s.changes;
                    return (
                      <TableRow key={i} className={!selected[String(i)] ? "opacity-50" : ""}>
                        <TableCell>
                          <Button
                            size="icon"
                            variant={selected[String(i)] ? "default" : "outline"}
                            className="size-7"
                            onClick={() =>
                              setSelected((s2) => ({ ...s2, [String(i)]: !s2[String(i)] }))
                            }
                          >
                            {selected[String(i)] ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{s.productTitle}</p>
                          <p className="text-xs text-muted-foreground">طابق بـ {s.matchedBy}</p>
                        </TableCell>
                        <TableCell className="text-xs space-y-1">
                          {c.title && <div><b>العنوان:</b> {c.title}</div>}
                          {c.vendor && <div><b>المورد:</b> {c.vendor}</div>}
                          {c.productType && <div><b>النوع:</b> {c.productType}</div>}
                          {c.tags && <div><b>الوسوم:</b> {c.tags.join(", ")}</div>}
                          {c.descriptionHtml && (
                            <div><b>الوصف:</b> {c.descriptionHtml.slice(0, 100)}...</div>
                          )}
                          {c.price && (
                            <div className="text-amber-700">
                              <b>السعر:</b> {c.price} (يحتاج تعديل يدوي للمتغير)
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSuggestions([]);
                  setCsvText("");
                }}
                disabled={applying}
              >
                ابدأ من جديد
              </Button>
              <Button onClick={applyAll} disabled={applying}>
                {applying && <Loader2 className="size-4 animate-spin ml-2" />}
                طبّق المحدد في Shopify
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Direct CSV sheet (export / edit / re-upload) ----------------

function SheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const exportFn = useServerFn(exportProductsCsv);
  const applyFn = useServerFn(applyCsvUpdates);
  const fileRef = useRef<HTMLInputElement>(null);
  const [maxRows, setMaxRows] = useState("500");
  const [result, setResult] = useState<{
    ok: number;
    failed: number;
    total: number;
    errors: Array<{ productId: string; message: string }>;
  } | null>(null);

  useEffect(() => {
    if (!open) setResult(null);
  }, [open]);

  const exportMut = useMutation({
    mutationFn: async () => exportFn({ data: { max: parseInt(maxRows, 10) || 500 } }),
    onSuccess: (res) => {
      const blob = new Blob(["\uFEFF" + res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `shopify-products-${ts}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`تم تنزيل الشيت — ${res.productCount} منتج (${res.rowCount} صف)`);
    },
    onError: (e: Error) => toast.error("فشل التصدير", { description: e.message }),
  });

  const applyMut = useMutation({
    mutationFn: async (csvText: string) => applyFn({ data: { csvText } }),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ["products"] });
      if (res.failed === 0) toast.success(`تم تحديث ${res.ok} منتج بنجاح`);
      else toast.warning(`نجح ${res.ok} — فشل ${res.failed}`);
    },
    onError: (e: Error) => toast.error("فشل التطبيق", { description: e.message }),
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    applyMut.mutate(text);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>شيت التعديلات (CSV)</DialogTitle>
          <DialogDescription>
            نزّل شيت بكل المنتجات، عدّل اللي عايزه في Excel أو Google Sheets، ثم ارفعه تاني — التعديلات تتطبق مباشرة في Shopify.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Download className="size-4 text-primary" />
              <h3 className="font-medium">1. تنزيل الشيت</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              الشيت بيحتوي على: العنوان، الوصف، المورد، النوع، الحالة، الوسوم، SEO، وكل المتغيرات (سعر، SKU، مخزن).
              عدّل أي خانة — لا تغيّر أعمدة <code>product_id</code> و <code>variant_id</code> و <code>inventory_item_id</code>.
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5 flex-1 max-w-[160px]">
                <Label htmlFor="max" className="text-xs">عدد المنتجات الأقصى</Label>
                <Input
                  id="max"
                  type="number"
                  min={1}
                  max={2000}
                  value={maxRows}
                  onChange={(e) => setMaxRows(e.target.value)}
                />
              </div>
              <Button onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
                {exportMut.isPending ? (
                  <Loader2 className="size-4 animate-spin ml-2" />
                ) : (
                  <Download className="size-4 ml-2" />
                )}
                تنزيل CSV
              </Button>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="size-4 text-primary" />
              <h3 className="font-medium">2. رفع الشيت المعدّل</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              التطبيق مباشر بدون مراجعة — التغييرات بتروح Shopify فوراً.
            </p>
            <div
              className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => !applyMut.isPending && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && !applyMut.isPending) onFile(f);
              }}
            >
              {applyMut.isPending ? (
                <>
                  <Loader2 className="size-6 mx-auto animate-spin text-primary mb-2" />
                  <p className="text-sm">جاري تطبيق التعديلات...</p>
                </>
              ) : (
                <>
                  <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">اضغط لاختيار شيت CSV أو اسحبه هنا</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </div>
          </div>

          {result && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium text-sm">نتيجة التطبيق</h3>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-700">✓ نجح: {result.ok}</span>
                {result.failed > 0 && (
                  <span className="text-destructive">✗ فشل: {result.failed}</span>
                )}
                <span className="text-muted-foreground">من إجمالي {result.total}</span>
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((er, i) => (
                    <div key={i} className="text-destructive">
                      <code className="text-[10px]">{er.productId.slice(-12)}</code>: {er.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Metafields Panel (in Edit dialog)
// ============================================================

type MFRow = ProductMetafield & { _dirty?: boolean; _new?: boolean; _delete?: boolean; _localId: string };

function MetafieldsPanel({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductMetafields);
  const saveFn = useServerFn(saveProductMetafields);
  const [rows, setRows] = useState<MFRow[]>([]);
  const q = useQuery({
    queryKey: ["metafields", productId],
    queryFn: () => listFn({ data: { productId } }),
  });
  useEffect(() => {
    if (q.data) {
      setRows(
        q.data.metafields.map((m, i) => ({
          ...m,
          _localId: m.id ?? `srv-${i}`,
        })),
      );
    }
  }, [q.data]);

  const patch = (id: string, p: Partial<MFRow>) =>
    setRows((rs) => rs.map((r) => (r._localId === id ? { ...r, ...p, _dirty: true } : r)));

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        _localId: `new-${Date.now()}-${rs.length}`,
        id: null,
        namespace: "custom",
        key: "",
        type: "single_line_text_field",
        value: "",
        _new: true,
        _dirty: true,
      },
    ]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const upserts = rows
        .filter((r) => !r._delete && r._dirty && r.key && r.namespace)
        .map((r) => ({ namespace: r.namespace, key: r.key, type: r.type, value: r.value }));
      const deletes = rows.filter((r) => r._delete && r.id).map((r) => r.id!) as string[];
      return saveFn({ data: { productId, upserts, deletes } });
    },
    onSuccess: () => {
      toast.success("تم حفظ الـ metafields");
      qc.invalidateQueries({ queryKey: ["metafields", productId] });
    },
    onError: (e: Error) => toast.error("فشل الحفظ", { description: e.message }),
  });

  if (q.isLoading) {
    return (
      <div className="py-8 grid place-items-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Metafields للمنتج — استخدم namespace ثابت مثل <code>custom</code> ومفاتيح فريدة.
      </p>
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right w-28">Namespace</TableHead>
              <TableHead className="text-right w-32">Key</TableHead>
              <TableHead className="text-right w-40">النوع</TableHead>
              <TableHead className="text-right">القيمة</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  لا يوجد metafields. اضغط "إضافة" لإنشاء واحد.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r._localId} className={r._delete ? "opacity-40 line-through" : ""}>
                <TableCell>
                  <Input
                    className="h-8"
                    value={r.namespace}
                    disabled={!!r.id}
                    onChange={(e) => patch(r._localId, { namespace: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={r.key}
                    disabled={!!r.id}
                    onChange={(e) => patch(r._localId, { key: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={r.type}
                    onValueChange={(v) => patch(r._localId, { type: v })}
                    disabled={!!r.id}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_line_text_field">نص قصير</SelectItem>
                      <SelectItem value="multi_line_text_field">نص طويل</SelectItem>
                      <SelectItem value="number_integer">رقم صحيح</SelectItem>
                      <SelectItem value="number_decimal">رقم عشري</SelectItem>
                      <SelectItem value="boolean">صواب/خطأ</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="url">رابط</SelectItem>
                      <SelectItem value="color">لون</SelectItem>
                      <SelectItem value="date">تاريخ</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {r.type === "multi_line_text_field" || r.type === "json" ? (
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={r.value}
                      onChange={(e) => patch(r._localId, { value: e.target.value })}
                    />
                  ) : (
                    <Input
                      className="h-8"
                      value={r.value}
                      onChange={(e) => patch(r._localId, { value: e.target.value })}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    onClick={() => patch(r._localId, { _delete: !r._delete })}
                    title={r._delete ? "إلغاء الحذف" : "حذف"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-between items-center">
        <Button size="sm" variant="outline" onClick={addRow}>
          <Plus className="size-3.5 ml-1" />
          إضافة metafield
        </Button>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending && <Loader2 className="size-3.5 animate-spin ml-1" />}
          حفظ الـ metafields
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Pricing Tools Dialog (% raise + spec pricing rules)
// ============================================================

const SPEC_RULES_KEY = "shopify_spec_rules_v1";
const DEFAULT_SPEC_RULES: SpecRules = {
  RAM: [
    { value: "8G", price: 1500, isDefault: true },
    { value: "16G", price: 3000 },
    { value: "32G", price: 6000 },
  ],
  SSD: [
    { value: "256G", price: 1500, isDefault: true },
    { value: "512G", price: 2700 },
    { value: "1T", price: 5000 },
  ],
};

function loadSpecRules(): SpecRules {
  try {
    const raw = localStorage.getItem(SPEC_RULES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SPEC_RULES;
}

function PricingToolsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>أدوات التسعير الجماعية</DialogTitle>
          <DialogDescription>
            رفع أسعار كل الأجهزة بنسبة %، أو تطبيق قواعد أسعار الرامات والهاردات على كل المنتجات.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="percent" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="percent">رفع الأسعار %</TabsTrigger>
            <TabsTrigger value="specs">قواعد الرامات والهاردات</TabsTrigger>
          </TabsList>
          <TabsContent value="percent" className="mt-4">
            <BulkPercentPanel onDone={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent value="specs" className="mt-4">
            <SpecRulesPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function BulkPercentPanel({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(bulkAdjustPrices);
  const [percent, setPercent] = useState("10");
  const [search, setSearch] = useState("");
  const [roundTo, setRoundTo] = useState("0");
  const [max, setMax] = useState("500");
  const [result, setResult] = useState<Awaited<ReturnType<typeof fn>> | null>(null);

  const mut = useMutation({
    mutationFn: async () =>
      fn({
        data: {
          percent: parseFloat(percent) || 0,
          search: search.trim() || undefined,
          roundTo: parseFloat(roundTo) || 0,
          max: parseInt(max, 10) || 500,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`تم تحديث ${r.updatedProducts} منتج (${r.updatedVariants} متغير)`);
    },
    onError: (e: Error) => toast.error("فشل", { description: e.message }),
  });

  const confirmRun = () => {
    const p = parseFloat(percent) || 0;
    if (!p) return toast.error("أدخل نسبة صحيحة");
    if (!confirm(`ستُعدَّل أسعار حتى ${max} منتج بنسبة ${p}%. هل تريد المتابعة؟`)) return;
    mut.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>النسبة % (سالب للتخفيض)</Label>
          <Input
            type="number"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="مثال: 10"
          />
        </div>
        <div className="space-y-1.5">
          <Label>تقريب لأقرب (اختياري)</Label>
          <Input
            type="number"
            value={roundTo}
            onChange={(e) => setRoundTo(e.target.value)}
            placeholder="0 = بدون تقريب"
          />
        </div>
        <div className="space-y-1.5">
          <Label>بحث (اختياري)</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="فلترة بعنوان/SKU"
          />
        </div>
        <div className="space-y-1.5">
          <Label>عدد المنتجات الأقصى</Label>
          <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
      </div>
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        ⚠️ التعديل مباشر في Shopify — تأكد قبل التنفيذ. لا يوجد تراجع تلقائي.
      </div>
      {result && (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex gap-4">
            <span className="text-emerald-700">✓ منتجات: {result.updatedProducts}</span>
            <span className="text-emerald-700">✓ متغيرات: {result.updatedVariants}</span>
            {result.failed > 0 && (
              <span className="text-destructive">✗ فشل: {result.failed}</span>
            )}
            <span className="text-muted-foreground">من {result.processed} مفحوص</span>
          </div>
          {result.errors.length > 0 && (
            <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
              {result.errors.map((e, i) => (
                <div key={i} className="text-destructive">
                  {e.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={mut.isPending}>
          إغلاق
        </Button>
        <Button onClick={confirmRun} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="size-4 animate-spin ml-2" />}
          <Percent className="size-4 ml-2" />
          طبّق على المنتجات
        </Button>
      </DialogFooter>
    </div>
  );
}

function SpecRulesPanel() {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewSpecPricing);
  const [rules, setRules] = useState<SpecRules>(() => loadSpecRules());
  const [search, setSearch] = useState("");
  const [max, setMax] = useState("500");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewFn>> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SPEC_RULES_KEY, JSON.stringify(rules));
    } catch {}
  }, [rules]);

  const updateVal = (opt: string, idx: number, patch: Partial<SpecRules[string][number]>) => {
    setRules((r) => ({
      ...r,
      [opt]: r[opt].map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    }));
  };
  const addVal = (opt: string) =>
    setRules((r) => ({ ...r, [opt]: [...(r[opt] ?? []), { value: "", price: 0 }] }));
  const delVal = (opt: string, idx: number) =>
    setRules((r) => ({ ...r, [opt]: r[opt].filter((_, i) => i !== idx) }));
  const setDefault = (opt: string, idx: number) =>
    setRules((r) => ({
      ...r,
      [opt]: r[opt].map((v, i) => ({ ...v, isDefault: i === idx })),
    }));
  const addOpt = () => {
    const name = prompt("اسم الخيار (مثال: Screen)");
    if (!name) return;
    setRules((r) => ({ ...r, [name]: [{ value: "", price: 0, isDefault: true }] }));
  };
  const delOpt = (opt: string) => {
    if (!confirm(`حذف خيار "${opt}" كله؟`)) return;
    setRules((r) => {
      const nr = { ...r };
      delete nr[opt];
      return nr;
    });
  };

  const previewMut = useMutation({
    mutationFn: async (apply: boolean) =>
      previewFn({
        data: {
          rules,
          search: search.trim() || undefined,
          max: parseInt(max, 10) || 500,
          apply,
        },
      }),
    onSuccess: (r) => {
      setPreview(r);
      if (r.applied) {
        qc.invalidateQueries({ queryKey: ["products"] });
        toast.success(`تم تطبيق التسعير على ${r.updatedProducts} منتج`);
      } else {
        toast.info(`معاينة: ${r.totalAffectedProducts} منتج سيتم تعديله`);
      }
    },
    onError: (e: Error) => toast.error("فشل", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        القواعد بتتخزن في المتصفح. لكل خيار (RAM/SSD…) عرّف القيم وأسعارها، وحدد القيمة "الافتراضية" اللي بتكون في الجهاز الأساسي.
        سعر أي متغير = <b>سعر الجهاز الأساسي</b> + (سعر السبيك المختار − سعر السبيك الافتراضي).
      </p>

      <div className="space-y-3">
        {Object.keys(rules).map((opt) => (
          <div key={opt} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="size-4 text-primary" />
                <h4 className="font-medium">{opt}</h4>
              </div>
              <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => delOpt(opt)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">القيمة</TableHead>
                  <TableHead className="text-right">السعر</TableHead>
                  <TableHead className="text-right">افتراضي</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules[opt].map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={v.value}
                        onChange={(e) => updateVal(opt, i, { value: e.target.value })}
                        placeholder="8G"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-28"
                        type="number"
                        value={v.price}
                        onChange={(e) => updateVal(opt, i, { price: parseFloat(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={v.isDefault ? "default" : "outline"}
                        onClick={() => setDefault(opt, i)}
                      >
                        {v.isDefault ? "✓ افتراضي" : "اجعله افتراضي"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => delVal(opt, i)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="sm" variant="outline" onClick={() => addVal(opt)}>
              <Plus className="size-3.5 ml-1" /> إضافة قيمة
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={addOpt}>
        <Plus className="size-3.5 ml-1" /> إضافة خيار جديد
      </Button>

      <div className="border-t pt-4 space-y-3">
        <h4 className="font-medium text-sm">التطبيق على المنتجات</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>بحث (اختياري)</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>عدد المنتجات الأقصى</Label>
            <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => previewMut.mutate(false)}
            disabled={previewMut.isPending}
          >
            {previewMut.isPending && !previewMut.variables && <Loader2 className="size-4 animate-spin ml-2" />}
            <Settings2 className="size-4 ml-2" /> معاينة (بدون حفظ)
          </Button>
          <Button
            onClick={() => {
              if (!confirm("سيتم تعديل أسعار المتغيرات في Shopify فوراً. متابعة؟")) return;
              previewMut.mutate(true);
            }}
            disabled={previewMut.isPending}
          >
            {previewMut.isPending && previewMut.variables && <Loader2 className="size-4 animate-spin ml-2" />}
            <Check className="size-4 ml-2" /> تطبيق على Shopify
          </Button>
        </div>

        {preview && (
          <div className="border rounded-md p-3 space-y-2 text-sm">
            <div className="flex gap-4 flex-wrap">
              <span>منتجات متأثرة: <b>{preview.totalAffectedProducts}</b></span>
              <span>متغيرات: <b>{preview.totalAffectedVariants}</b></span>
              {preview.applied && (
                <>
                  <span className="text-emerald-700">✓ محدَّث: {preview.updatedProducts}</span>
                  {preview.failed > 0 && (
                    <span className="text-destructive">✗ فشل: {preview.failed}</span>
                  )}
                </>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right">المتغير</TableHead>
                    <TableHead className="text-right">قديم</TableHead>
                    <TableHead className="text-right">جديد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.preview.flatMap((p) =>
                    p.variantChanges.map((c) => (
                      <TableRow key={c.variantId}>
                        <TableCell className="text-xs">{p.productTitle}</TableCell>
                        <TableCell className="text-xs">{c.options}</TableCell>
                        <TableCell className="tabular-nums">{c.oldPrice}</TableCell>
                        <TableCell className="tabular-nums font-medium">{c.newPrice}</TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

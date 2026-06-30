import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Search, ImageOff, Package, RefreshCw } from "lucide-react";

import { listProducts, updateProduct, type AdminProduct } from "@/lib/shopify.functions";
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
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة تحكم المنتجات | Shopify Admin" },
      { name: "description", content: "إدارة منتجات متجر Shopify: عرض، بحث، فلترة، وتعديل سريع للأسعار والمخزون." },
    ],
  }),
  component: ProductsDashboard,
});

function useDebounced<T>(value: T, delay = 350): T {
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
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Package className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">لوحة تحكم المنتجات</h1>
              <p className="text-xs text-muted-foreground">إدارة منتجات متجر Shopify الخاص بك</p>
            </div>
          </div>
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

      <EditDialog
        product={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function ProductRow({ product, onEdit }: { product: AdminProduct; onEdit: () => void }) {
  const qty = product.totalInventory ?? 0;
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-md bg-muted overflow-hidden grid place-items-center shrink-0">
            {product.featuredImage ? (
              <img
                src={product.featuredImage}
                alt={product.title}
                className="size-full object-cover"
              />
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
      <TableCell className="text-sm text-muted-foreground">
        {product.variant?.sku || "—"}
      </TableCell>
      <TableCell className="font-medium tabular-nums">
        {product.variant
          ? `${product.variant.price} ${product.variant.currencyCode}`
          : "—"}
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

function EditDialog({
  product,
  onOpenChange,
}: {
  product: AdminProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateProduct);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [inventory, setInventory] = useState("");

  useEffect(() => {
    if (product) {
      setTitle(product.title);
      setDescription(product.descriptionHtml ?? "");
      setPrice(product.variant?.price ?? "");
      setInventory(String(product.variant?.inventoryQuantity ?? 0));
    }
  }, [product]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("لا يوجد منتج للتعديل");
      const payload: Parameters<typeof updateFn>[0]["data"] = {
        productId: product.id,
      };
      if (title !== product.title) payload.title = title;
      if (description !== (product.descriptionHtml ?? "")) payload.descriptionHtml = description;
      if (product.variant) {
        if (price !== product.variant.price) {
          payload.variantId = product.variant.id;
          payload.price = price;
        }
        const newQty = parseInt(inventory, 10);
        if (
          !Number.isNaN(newQty) &&
          newQty !== product.variant.inventoryQuantity &&
          product.variant.inventoryItemId
        ) {
          payload.inventoryItemId = product.variant.inventoryItemId;
          payload.inventoryQuantity = newQty;
        }
      }
      return updateFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم حفظ التعديلات في Shopify");
      qc.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("فشل الحفظ", { description: err.message });
    },
  });

  const multiVariant = (product?.variantCount ?? 0) > 1;

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل سريع</DialogTitle>
          <DialogDescription>
            ستُحفظ التغييرات مباشرة في متجر Shopify.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">العنوان</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">الوصف</Label>
            <Textarea
              id="desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="price">السعر</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={!product?.variant || multiVariant}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv">المخزن</Label>
              <Input
                id="inv"
                inputMode="numeric"
                value={inventory}
                onChange={(e) => setInventory(e.target.value)}
                disabled={!product?.variant?.inventoryItemId || multiVariant}
              />
            </div>
          </div>

          {multiVariant && (
            <p className="text-xs text-muted-foreground">
              هذا المنتج له عدة متغيرات. السعر والمخزون يُعدَّلان من Shopify Admin مباشرةً.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin ml-2" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

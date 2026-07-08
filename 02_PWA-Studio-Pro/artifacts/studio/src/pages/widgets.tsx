import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListWidgetRegistry,
  useRegisterWidget,
  getListWidgetRegistryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Puzzle, Search, Tag } from "lucide-react";

const registerWidgetSchema = z.object({
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  name: z.string().min(1, "Name is required"),
  version: z.string().default("1.0.0"),
  description: z.string().default(""),
  tags: z.string().default(""),
});

type RegisterWidgetForm = z.infer<typeof registerWidgetSchema>;

export default function Widgets() {
  const { data: widgets, isLoading } = useListWidgetRegistry();
  const registerWidget = useRegisterWidget();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [search, setSearch] = useState("");

  const form = useForm<RegisterWidgetForm>({
    resolver: zodResolver(registerWidgetSchema),
    defaultValues: { slug: "", name: "", version: "1.0.0", description: "", tags: "" },
  });

  function onSubmit(values: RegisterWidgetForm) {
    const tags = values.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    registerWidget.mutate(
      {
        data: {
          slug: values.slug,
          name: values.name,
          version: values.version,
          description: values.description,
          tags,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWidgetRegistryQueryKey() });
          setRegisterOpen(false);
          form.reset();
          toast({ title: "Widget registered" });
        },
        onError: () => {
          toast({ title: "Failed to register widget", variant: "destructive" });
        },
      }
    );
  }

  const filtered = (Array.isArray(widgets) ? widgets : []).filter(
    (w) =>
      !search ||
      (w.name && w.name.toLowerCase().includes(search.toLowerCase())) ||
      (w.slug && w.slug.includes(search.toLowerCase())) ||
      (w.description && w.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <AppLayout title="Widget Registry">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Widget Registry</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {widgets?.length ?? 0} registered widget type{widgets?.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setRegisterOpen(true)}
            data-testid="button-register-widget"
          >
            <Plus className="w-3.5 h-3.5" />
            Register widget
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search widgets..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-widgets"
          />
        </div>

        {/* Widget list */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-md" />
            ))}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-10 text-center">
            <Puzzle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {search ? "No widgets match your search." : "No widgets registered yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered?.map((w) => (
              <div
                key={w.id}
                className="rounded-md border border-border bg-card p-4 space-y-2"
                data-testid={`card-widget-${w.slug}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{w.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{w.slug}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-xs font-mono">v{w.version}</Badge>
                    {w.isBuiltin === "true" && (
                      <Badge variant="default" className="text-xs">Built-in</Badge>
                    )}
                  </div>
                </div>
                {w.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{w.description}</p>
                )}
                {w.tags?.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    {w.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs" data-testid={`badge-tag-${w.slug}-${tag}`}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Register Dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent data-testid="dialog-register-widget">
          <DialogHeader>
            <DialogTitle>Register Widget Type</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="my-widget" {...field} data-testid="input-widget-slug" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input placeholder="1.0.0" {...field} data-testid="input-widget-version" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Widget" {...field} data-testid="input-widget-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What does this widget do?" rows={2} {...field} data-testid="input-widget-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (comma-separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="chart, data, ui" {...field} data-testid="input-widget-tags" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setRegisterOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={registerWidget.isPending} data-testid="button-submit-register-widget">
                  {registerWidget.isPending ? "Registering..." : "Register"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

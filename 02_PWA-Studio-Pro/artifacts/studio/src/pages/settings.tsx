import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/layout/theme-provider";
import { Plus, Trash2 } from "lucide-react";

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  activeModel: z.string().min(1, "Model is required"),
  llmBaseUrl: z.string(),
  llmApiKey: z.string(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface ApiKeyEntry {
  key: string;
  value: string;
}

export default function Settings() {
  // On a static Vercel deploy there is no API server, so disable queries to avoid
  // 404 console errors. Local dev (DEV) or an explicit VITE_API_ENABLED opt-in keeps them active.
  const apiEnabled = import.meta.env.DEV || import.meta.env.VITE_API_ENABLED === "true";
  const { data: settings, isLoading } = useGetSettings({ query: { enabled: apiEnabled } });
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { setTheme } = useTheme();

  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: "dark",
      activeModel: "gpt-4o",
      llmBaseUrl: "",
      llmApiKey: "",
    },
  });

  useEffect(() => {
    if (settings) {
      const overrides = settings.apiOverrides as Record<string, string> | null;
      form.reset({
        theme: (settings.theme as "light" | "dark" | "system") ?? "dark",
        activeModel: settings.activeModel ?? "gpt-4o",
        llmBaseUrl: overrides?.llmBaseUrl ?? "",
        llmApiKey: overrides?.llmApiKey ?? "",
      });
      if (overrides && typeof overrides === "object") {
        const extraKeys = Object.entries(overrides).filter(
          ([k]) => k !== "llmBaseUrl" && k !== "llmApiKey"
        );
        setApiKeys(extraKeys.map(([key, value]) => ({ key, value: String(value) })));
      }
    }
  }, [settings, form]);

  function addApiKey() {
    setApiKeys((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeApiKey(idx: number) {
    setApiKeys((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateApiKey(idx: number, field: "key" | "value", val: string) {
    setApiKeys((prev) => prev.map((entry, i) => (i === idx ? { ...entry, [field]: val } : entry)));
  }

  function onSubmit(values: SettingsForm) {
    const apiOverrides: Record<string, string> = {};
    if (values.llmBaseUrl.trim()) apiOverrides.llmBaseUrl = values.llmBaseUrl.trim();
    if (values.llmApiKey.trim()) apiOverrides.llmApiKey = values.llmApiKey.trim();
    for (const entry of apiKeys) {
      if (entry.key.trim()) {
        apiOverrides[entry.key.trim()] = entry.value;
      }
    }

    updateSettings.mutate(
      {
        data: {
          theme: values.theme,
          activeModel: values.activeModel,
          apiOverrides,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          setTheme(updated.theme as "light" | "dark" | "system");
          toast({ title: "Settings saved" });
        },
        onError: () => {
          toast({ title: "Failed to save settings", variant: "destructive" });
        },
      }
    );
  }

  return (
    <AppLayout title="Settings">
      <div className="p-6 max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure your workspace preferences.</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* Appearance */}
              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Appearance
                </h2>
                <Separator />
                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Theme</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-theme">
                            <SelectValue placeholder="Select theme" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* AI Model */}
              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  AI Model
                </h2>
                <Separator />
                <FormField
                  control={form.control}
                  name="activeModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Active Model</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-active-model">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                          <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                          <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                          <SelectItem value="gemini-flash">Gemini Flash</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The model used for AI conversations within projects.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Custom model identifier</label>
                  <Input
                    placeholder="e.g. claude-3-5-sonnet-20241022"
                    value={form.watch("activeModel")}
                    onChange={(e) => form.setValue("activeModel", e.target.value)}
                    className="font-mono text-sm"
                    data-testid="input-active-model"
                  />
                  <p className="text-xs text-muted-foreground">Override the model with any API-compatible identifier.</p>
                </div>
              </section>

              {/* Local LLM */}
              <section className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Local LLM
                </h2>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Required to enable AI responses. Set your endpoint and the chat panel will call it directly. Leave blank to disable AI chat.
                </p>
                <FormField
                  control={form.control}
                  name="llmBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="http://localhost:11434/v1"
                          className="font-mono text-sm"
                          data-testid="input-llm-base-url"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Ollama: <code className="text-xs">http://localhost:11434/v1</code> &nbsp;·&nbsp;
                        LM Studio: <code className="text-xs">http://localhost:1234/v1</code>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="llmApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="ollama  (or your key for hosted APIs)"
                          type="password"
                          className="font-mono text-sm"
                          data-testid="input-llm-api-key"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Required for hosted APIs. For Ollama / LM Studio, any non-empty string works.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* API Key Overrides */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    API Key Overrides
                  </h2>
                  <Badge variant="outline" className="text-xs">{apiKeys.length} key{apiKeys.length !== 1 ? "s" : ""}</Badge>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Override default API keys for specific providers. Keys are stored in your workspace settings.
                </p>

                <div className="space-y-2">
                  {apiKeys.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="Provider key (e.g. OPENAI_API_KEY)"
                        value={entry.key}
                        onChange={(e) => updateApiKey(idx, "key", e.target.value)}
                        className="font-mono text-xs w-48 shrink-0"
                        data-testid={`input-api-key-name-${idx}`}
                      />
                      <Input
                        placeholder="sk-..."
                        value={entry.value}
                        onChange={(e) => updateApiKey(idx, "value", e.target.value)}
                        type="password"
                        className="font-mono text-xs flex-1"
                        data-testid={`input-api-key-value-${idx}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeApiKey(idx)}
                        data-testid={`button-remove-api-key-${idx}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addApiKey}
                  data-testid="button-add-api-key"
                >
                  <Plus className="w-3.5 h-3.5" /> Add API key
                </Button>
              </section>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateSettings.isPending} data-testid="button-save-settings">
                  {updateSettings.isPending ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {settings && (
          <div className="text-xs text-muted-foreground">
            Last updated {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '—'}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

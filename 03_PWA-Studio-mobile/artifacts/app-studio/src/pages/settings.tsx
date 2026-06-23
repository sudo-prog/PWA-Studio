import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Monitor, Loader2, Save, Github, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useVerifyGitHubToken, type GitHubUser } from "@/hooks/useGitHub";

const settingsSchema = z.object({
  openaiKey: z.string().optional(),
  anthropicKey: z.string().optional(),
  geminiKey: z.string().optional(),
  customEndpoint: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  defaultModel: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]),
  githubToken: z.string().optional(),
  githubDefaultRepo: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format")
    .optional()
    .or(z.literal("")),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [ghError, setGhError] = useState<string | null>(null);

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Settings saved",
          description: "Your preferences have been updated successfully.",
        });
        queryClient.setQueryData(getGetSettingsQueryKey(), data);
        if (data.theme) setTheme(data.theme);
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to save settings.",
          variant: "destructive",
        });
      }
    }
  });

  const verifyToken = useVerifyGitHubToken();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      openaiKey: "",
      anthropicKey: "",
      geminiKey: "",
      customEndpoint: "",
      defaultModel: "claude-3-5-sonnet",
      theme: "system",
      githubToken: "",
      githubDefaultRepo: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        openaiKey: settings.openaiKey || "",
        anthropicKey: settings.anthropicKey || "",
        geminiKey: settings.geminiKey || "",
        customEndpoint: settings.customEndpoint || "",
        defaultModel: settings.defaultModel || "claude-3-5-sonnet",
        theme: settings.theme || "system",
        githubToken: settings.githubToken || "",
        githubDefaultRepo: settings.githubDefaultRepo || "",
      });
    }
  }, [settings, form]);

  function onSubmit(data: SettingsValues) {
    updateSettings.mutate({
      data: {
        ...data,
        customEndpoint: data.customEndpoint === "" ? undefined : data.customEndpoint,
        githubToken: data.githubToken === "" ? undefined : data.githubToken,
        githubDefaultRepo: data.githubDefaultRepo === "" ? undefined : data.githubDefaultRepo,
      }
    });
  }

  async function handleTestConnection() {
    setGhError(null);
    setGhUser(null);

    // Save token first if it's been changed
    const tokenValue = form.getValues("githubToken");
    if (tokenValue && tokenValue !== (settings?.githubToken ?? "")) {
      await new Promise<void>((resolve, reject) => {
        updateSettings.mutate(
          { data: { githubToken: tokenValue } },
          { onSuccess: () => resolve(), onError: () => reject() },
        );
      });
    }

    verifyToken.mutate(undefined, {
      onSuccess: (user) => {
        setGhUser(user);
      },
      onError: () => {
        setGhError("Authentication failed. Check your token and try again.");
      },
    });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <Skeleton className="h-[260px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your LLM providers and app preferences.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* API Keys */}
          <Card className="glass-panel border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                API Keys
              </CardTitle>
              <CardDescription>
                Provide API keys for the models you want your agents to use. Keys are stored locally.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="anthropicKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anthropic API Key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-ant-..." className="bg-background/50 font-mono text-sm" {...field} />
                    </FormControl>
                    <FormDescription>Recommended for Director and Builder agents (Claude 3.5 Sonnet).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="openaiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenAI API Key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-..." className="bg-background/50 font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="geminiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Google Gemini API Key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="AIza..." className="bg-background/50 font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/50">
                <FormField
                  control={form.control}
                  name="defaultModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Model</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder="Select a model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet (Best)</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customEndpoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Endpoint URL (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://api.custom.com/v1" className="bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* GitHub Integration */}
          <Card className="glass-panel border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5 text-primary" />
                GitHub Integration
              </CardTitle>
              <CardDescription>
                Connect GitHub to auto-backup projects and publish live previews via GitHub Pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="githubToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Access Token</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="github_pat_..."
                        className="bg-background/50 font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Needs{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">repo</code> scope.{" "}
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=APP+Studio"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
                      >
                        Generate one on GitHub
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Test connection */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={verifyToken.isPending || updateSettings.isPending}
                  onClick={handleTestConnection}
                >
                  {verifyToken.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <Github className="h-3.5 w-3.5 mr-2" />
                  )}
                  Test Connection
                </Button>

                {ghUser && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <img
                      src={ghUser.avatarUrl}
                      alt={ghUser.login}
                      className="h-5 w-5 rounded-full"
                    />
                    <span>Connected as <strong>@{ghUser.login}</strong></span>
                  </div>
                )}

                {ghError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{ghError}</span>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="githubDefaultRepo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Backup Repo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="owner/repo-name"
                        className="bg-background/50 font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Projects without a specific repo set will back up here. Format:{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">owner/repo</code>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card className="glass-panel border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Theme Preference</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50">
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
            </CardContent>
          </Card>

          <div className="flex justify-end sticky bottom-6 z-10">
            <Button
              type="submit"
              disabled={updateSettings.isPending}
              className="rounded-xl shadow-lg shadow-primary/25 min-w-[140px]"
            >
              {updateSettings.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Preferences
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

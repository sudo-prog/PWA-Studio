import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useCreateProject, getListProjectsQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Sparkles, Github, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useInitRepo } from "@/hooks/useGitHub";

const formSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
  framework: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FRAMEWORKS = [
  {
    value: "react-vite-pwa",
    label: "React + Vite PWA",
    icon: "⚛️",
    description: "TypeScript · Tailwind CSS · vite-plugin-pwa",
    color: "from-blue-50 to-cyan-50 border-blue-200 dark:from-blue-950/30 dark:to-cyan-950/30 dark:border-blue-800",
    activeColor: "ring-2 ring-blue-500",
  },
  {
    value: "pwa-starter",
    label: "PWABuilder Starter",
    icon: "🔥",
    description: "Lit Web Components · TypeScript · vite-plugin-pwa",
    color: "from-orange-50 to-amber-50 border-orange-200 dark:from-orange-950/30 dark:to-amber-950/30 dark:border-orange-800",
    activeColor: "ring-2 ring-orange-500",
  },
  {
    value: "vue-vite-pwa",
    label: "Vue 3 + Vite PWA",
    icon: "💚",
    description: "TypeScript · Composition API · vite-plugin-pwa",
    color: "from-emerald-50 to-green-50 border-emerald-200 dark:from-emerald-950/30 dark:to-green-950/30 dark:border-emerald-800",
    activeColor: "ring-2 ring-emerald-500",
  },
  {
    value: "svelte-vite-pwa",
    label: "Svelte + Vite PWA",
    icon: "🔴",
    description: "TypeScript · Svelte 5 · vite-plugin-pwa",
    color: "from-red-50 to-orange-50 border-red-200 dark:from-red-950/30 dark:to-orange-950/30 dark:border-red-800",
    activeColor: "ring-2 ring-red-500",
  },
] as const;

export default function NewProject() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scaffoldingMsg, setScaffoldingMsg] = useState<string | null>(null);

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const initRepo = useInitRepo();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      framework: "react-vite-pwa",
    },
  });

  const createProject = useCreateProject({
    mutation: {
      onSuccess: (project) => {
        if (settings?.githubToken) {
          setScaffoldingMsg("Creating GitHub repo & pushing PWA scaffold…");
          initRepo.mutate(project.id, {
            onSuccess: (result) => {
              setScaffoldingMsg(null);
              queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
              toast({
                title: "Project ready",
                description: `Repo created: ${result.repo} — ${result.filesCount} files pushed`,
              });
              setLocation(`/projects/${project.id}/canvas`);
            },
            onError: () => {
              setScaffoldingMsg(null);
              queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
              toast({
                title: "Project created",
                description: "GitHub repo setup failed — retry from the project page.",
                variant: "destructive",
              });
              setLocation(`/projects/${project.id}/canvas`);
            },
          });
        } else {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({
            title: "Project created",
            description: "Your AI-powered project is ready.",
          });
          setLocation(`/projects/${project.id}/canvas`);
        }
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to create project. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const isBusy = createProject.isPending || scaffoldingMsg !== null;

  function onSubmit(data: FormValues) {
    createProject.mutate({ data });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">New Project</h1>
          <p className="text-muted-foreground">Initialize a new creative space for your agents.</p>
        </div>
      </div>

      <Card className="glass-panel border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Give your project a name and choose your PWA stack.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Crypto Dashboard" className="bg-background/50" {...field} />
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
                    <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What will this PWA do?"
                        className="resize-none bg-background/50 h-24"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This helps the AI director understand context and is shown on the GitHub Pages preview.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Framework picker */}
              <FormField
                control={form.control}
                name="framework"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PWA Stack</FormLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {FRAMEWORKS.map((fw) => {
                        const isActive = field.value === fw.value;
                        return (
                          <button
                            key={fw.value}
                            type="button"
                            onClick={() => field.onChange(fw.value)}
                            className={cn(
                              "text-left rounded-xl border bg-gradient-to-br p-4 transition-all duration-150",
                              fw.color,
                              isActive
                                ? fw.activeColor
                                : "hover:shadow-sm hover:scale-[1.01]",
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{fw.icon}</span>
                              <span className="font-semibold text-sm">{fw.label}</span>
                              {isActive && (
                                <CheckCircle2 className="h-4 w-4 ml-auto text-primary" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{fw.description}</p>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* GitHub auto-create notice */}
              {settings?.githubToken ? (
                <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                  <Github className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">GitHub repo will be auto-created</p>
                    <p className="text-emerald-600/80 dark:text-emerald-400/80 text-xs mt-0.5">
                      A new repo named after your project will be created and the chosen PWA template will be pushed as the initial commit.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl bg-muted/60 border border-border/50 px-4 py-3">
                  <Github className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-muted-foreground">No GitHub token</p>
                    <p className="text-muted-foreground/70 text-xs mt-0.5">
                      Add a GitHub PAT in{" "}
                      <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">
                        Settings
                      </Link>{" "}
                      to auto-create a repo for every new project.
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <Button
                  type="submit"
                  disabled={isBusy}
                  className="rounded-xl shadow-md min-w-[180px]"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {scaffoldingMsg ?? "Creating…"}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Initialize Agents
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

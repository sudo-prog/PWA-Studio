import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Sparkles, Layers, Bot, Zap, Check } from "lucide-react";
import { useUpdateSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to APP Studio",
    subtitle: "Your AI-powered multi-agent PWA creator",
    icon: Sparkles,
  },
  {
    id: "capabilities",
    title: "What can APP Studio do?",
    subtitle: "A team of specialized agents builds your app",
    icon: Bot,
  },
  {
    id: "setup",
    title: "Connect an LLM",
    subtitle: "Add an API key so your agents can start working",
    icon: Zap,
  },
];

const FEATURES = [
  { icon: Layers, label: "ForgeCanvas", desc: "Wireframe your UI with an infinite canvas" },
  { icon: Bot, label: "Agent Board", desc: "7 specialized agents — director, design, builder, tester & more" },
  { icon: Zap, label: "Instant Deploy", desc: "From idea to deployed PWA in minutes" },
];

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("anthropic");

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        markOnboardingComplete();
        navigate("/");
      },
      onError: () => {
        toast({ title: "Couldn't save key", description: "You can set it later in Settings.", variant: "destructive" });
        markOnboardingComplete();
        navigate("/");
      }
    }
  });

  function markOnboardingComplete() {
    localStorage.setItem("onboarding_complete", "1");
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  }

  function handleSkip() {
    markOnboardingComplete();
    navigate("/");
  }

  function handleFinish() {
    if (apiKey.trim()) {
      const keyField = provider === "anthropic" ? "anthropicKey"
        : provider === "openai" ? "openaiKey"
        : "geminiKey";
      updateSettings.mutate({ data: { [keyField]: apiKey.trim(), defaultModel: provider === "anthropic" ? "claude-3-5-sonnet" : provider === "openai" ? "gpt-4o" : "gemini-2.0-flash" } });
    } else {
      handleSkip();
    }
  }

  const currentStep = STEPS[step];
  const StepIcon = currentStep.icon;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-500/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/40" : "w-4 bg-border"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
            className="glass-panel rounded-3xl p-8 shadow-2xl border border-border/50"
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <StepIcon className="w-8 h-8 text-primary" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-center tracking-tight mb-2">{currentStep.title}</h1>
            <p className="text-muted-foreground text-center text-sm mb-8">{currentStep.subtitle}</p>

            {/* Step content */}
            {step === 0 && (
              <div className="space-y-3 mb-8">
                {FEATURES.map((f) => (
                  <div key={f.label} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <f.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3 mb-8">
                {[
                  { role: "Director", color: "bg-purple-100 text-purple-700", desc: "Breaks your idea into tasks" },
                  { role: "Design", color: "bg-pink-100 text-pink-700", desc: "Crafts the UI and style guide" },
                  { role: "Builder", color: "bg-blue-100 text-blue-700", desc: "Writes the frontend & backend code" },
                  { role: "Tester", color: "bg-green-100 text-green-700", desc: "Runs audits and catches bugs" },
                  { role: "Deployer", color: "bg-amber-100 text-amber-700", desc: "Publishes your PWA to the web" },
                ].map((a) => (
                  <div key={a.role} className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${a.color}`}>{a.role}</span>
                    <span className="text-sm text-muted-foreground">{a.desc}</span>
                  </div>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <Label>LLM Provider</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">Anthropic (Claude 3.5 Sonnet) — Recommended</SelectItem>
                      <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
                      <SelectItem value="gemini">Google Gemini 2.0 Flash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    placeholder={provider === "anthropic" ? "sk-ant-..." : provider === "openai" ? "sk-..." : "AIza..."}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="rounded-xl font-mono"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Stored securely — you can change this in Settings any time.</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {step < STEPS.length - 1 ? (
                <>
                  <Button variant="ghost" className="flex-1 rounded-xl" onClick={handleSkip}>
                    Skip
                  </Button>
                  <Button className="flex-1 rounded-xl" onClick={handleNext}>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" className="flex-1 rounded-xl" onClick={handleSkip}>
                    Skip for now
                  </Button>
                  <Button
                    className="flex-1 rounded-xl"
                    onClick={handleFinish}
                    disabled={updateSettings.isPending}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {apiKey.trim() ? "Save & Start" : "Start Building"}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

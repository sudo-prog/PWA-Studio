import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Layout, CheckCircle2, Play, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AGENT_ROLE_COLORS } from "@/lib/constants";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({
    query: {
      queryKey: getGetDashboardQueryKey()
    }
  });

  if (isLoading || !dashboard) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: "Total Projects",
      value: dashboard.totalProjects,
      icon: Layout,
      color: "text-blue-500",
    },
    {
      title: "Active Projects",
      value: dashboard.activeProjects,
      icon: Activity,
      color: "text-amber-500",
    },
    {
      title: "Running Agents",
      value: dashboard.runningAgents,
      icon: Play,
      color: "text-emerald-500",
    },
    {
      title: "Completed Tasks",
      value: dashboard.completedTasks,
      icon: CheckCircle2,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Your AI agents' creative command center.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="glass-panel border-0 shadow-sm overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 glass-panel border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Agent Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.agentBreakdown?.map((agent) => (
                <div key={agent.role} className="flex items-center">
                  <div className="w-24 font-medium capitalize text-sm">{agent.role}</div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className={`text-xs px-2 py-1 rounded-full capitalize font-medium ${AGENT_ROLE_COLORS[agent.role] || AGENT_ROLE_COLORS.system}`}>
                      {agent.status}
                    </div>
                    <div className="text-sm text-muted-foreground">{agent.count} tasks</div>
                  </div>
                </div>
              ))}
              {(!dashboard.agentBreakdown || dashboard.agentBreakdown.length === 0) && (
                <div className="text-sm text-muted-foreground text-center py-4">No active agents right now.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 glass-panel border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.recentActivity?.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 text-sm">
                  <div className={`mt-0.5 rounded-full p-1.5 ${AGENT_ROLE_COLORS[activity.agentRole] || AGENT_ROLE_COLORS.system}`}>
                    <Activity className="h-3 w-3" />
                  </div>
                  <div>
                    <p className="font-medium">{activity.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.createdAt).toLocaleTimeString()} · {activity.agentRole}
                    </p>
                  </div>
                </div>
              ))}
              {(!dashboard.recentActivity || dashboard.recentActivity.length === 0) && (
                <div className="text-sm text-muted-foreground text-center py-4">No recent activity.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { useListProjects, getListProjectsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Layout, GitBranch, Globe, ArrowRight, FolderKanban } from "lucide-react";
import { motion } from "framer-motion";
import { PROJECT_STATUS_COLORS } from "@/lib/constants";

export default function ProjectsList() {
  const { data: projects, isLoading } = useListProjects({ status: "all" }, {
    query: {
      queryKey: getListProjectsQueryKey({ status: "all" })
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage your AI-powered PWAs.</p>
        </div>
        <Link href="/projects/new">
          <Button className="rounded-xl shadow-md hover-elevate">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <Card className="glass-panel border-0 border-dashed border-2 flex flex-col items-center justify-center p-12 text-center h-64">
          <FolderKanban className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mt-2">
            Create your first project to start building with AI agents.
          </p>
          <Link href="/projects/new">
            <Button variant="outline" className="rounded-xl">
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects?.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link href={`/projects/${project.id}/canvas`}>
                <Card className="glass-panel border-0 shadow-sm overflow-hidden relative group cursor-pointer hover-elevate h-full flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <CardHeader className="pb-3 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-xl mb-1 group-hover:text-primary transition-colors">{project.name}</CardTitle>
                      {project.framework && (
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Layout className="h-3 w-3 mr-1" />
                          {project.framework}
                        </div>
                      )}
                    </div>
                    <div className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${PROJECT_STATUS_COLORS[project.status]}`}>
                      {project.status}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col justify-between">
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-6">
                      {project.description || "No description provided."}
                    </p>
                    
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Task Progress</span>
                          <span>{project.completedTaskCount || 0} / {project.taskCount || 0}</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-1000 ease-out rounded-full" 
                            style={{ 
                              width: project.taskCount 
                                ? `${((project.completedTaskCount || 0) / project.taskCount) * 100}%` 
                                : '0%' 
                            }} 
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                        <div className="flex gap-3">
                          {project.githubRepo && (
                            <div className="flex items-center hover:text-foreground transition-colors" title="Repository">
                              <GitBranch className="h-3.5 w-3.5 mr-1" />
                              Repo
                            </div>
                          )}
                          {project.previewUrl && (
                            <div className="flex items-center hover:text-foreground transition-colors" title="Preview URL">
                              <Globe className="h-3.5 w-3.5 mr-1" />
                              Preview
                            </div>
                          )}
                        </div>
                        <div className="flex items-center font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 transform duration-300">
                          Open <ArrowRight className="h-3 w-3 ml-1" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
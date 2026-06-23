import { useMutation, useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface GitHubRepo {
  id: number;
  fullName: string;
  name: string;
  private: boolean;
  url: string;
}

export interface GitHubBackupResult {
  url: string;
  repo: string;
}

export interface GitHubPublishResult {
  url: string;
  repo: string;
}

export interface InitRepoResult {
  repo: string;
  url: string;
  framework: string;
  filesCount: number;
}

export function useVerifyGitHubToken() {
  return useMutation({
    mutationFn: () => customFetch<GitHubUser>("/api/github/me"),
  });
}

export function useGitHubRepos(enabled = false) {
  return useQuery({
    queryKey: ["github-repos"],
    queryFn: () => customFetch<GitHubRepo[]>("/api/github/repos"),
    enabled,
    staleTime: 60_000,
  });
}

export function useInitRepo() {
  return useMutation({
    mutationFn: (projectId: number) =>
      customFetch<InitRepoResult>(`/api/github/init-repo/${projectId}`, {
        method: "POST",
      }),
  });
}

export function useBackupProject() {
  return useMutation({
    mutationFn: (projectId: number) =>
      customFetch<GitHubBackupResult>(`/api/github/backup/${projectId}`, {
        method: "POST",
      }),
  });
}

export function usePublishProject() {
  return useMutation({
    mutationFn: (projectId: number) =>
      customFetch<GitHubPublishResult>(`/api/github/publish/${projectId}`, {
        method: "POST",
      }),
  });
}

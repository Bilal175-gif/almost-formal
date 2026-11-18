"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Settings } from "@/lib/api";
export function SocialFollow() {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  return (
    <a href={data?.instagram || "https://www.instagram.com/almost.formal/"} target="_blank" rel="noreferrer">
      Follow the drop <strong>@almost.formal</strong>
    </a>
  );
}

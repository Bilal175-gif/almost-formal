"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Settings } from "@/lib/api";
export function SocialFollow() {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  const label = (
    <>
      Follow the drop <strong>@almostformal</strong>
    </>
  );
  return data?.instagram ? (
    <a href={data.instagram} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

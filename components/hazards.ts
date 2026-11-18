import { Activity, Mountain, Tornado, Waves, type LucideIcon } from "lucide-react";
import type { Kind } from "@/lib/maps";

export const HAZARD_ICON: Record<Kind, LucideIcon> = { gempa: Activity, banjir: Waves, angin: Tornado, longsor: Mountain };

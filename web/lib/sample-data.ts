// Synthetic sample data for the wedge mockups (no real PII).

export type CandidateStatus = "new" | "contacted" | "screening" | "submitted";

export interface Candidate {
  id: string;
  name: string;
  title: string;
  location: string;
  email: string;
  skills: string[];
  status: CandidateStatus;
  resumeVersions: number;
  lastActivity: string;
  consent: boolean;
}

export const candidates: Candidate[] = [
  { id: "c1", name: "Amara Okafor", title: "Senior Backend Engineer", location: "Austin, TX", email: "amara.o@example.test", skills: ["Python", "PostgreSQL", "AWS"], status: "screening", resumeVersions: 2, lastActivity: "2h ago", consent: true },
  { id: "c2", name: "Devin Park", title: "Staff Frontend Engineer", location: "Remote (US)", email: "devin.park@example.test", skills: ["TypeScript", "React", "Next.js"], status: "contacted", resumeVersions: 1, lastActivity: "1d ago", consent: true },
  { id: "c3", name: "Lena Vasquez", title: "Data Platform Lead", location: "Chicago, IL", email: "lena.v@example.test", skills: ["Spark", "dbt", "Airflow"], status: "submitted", resumeVersions: 3, lastActivity: "3d ago", consent: true },
  { id: "c4", name: "Tomás Reyes", title: "DevOps Engineer", location: "Denver, CO", email: "tomas.r@example.test", skills: ["Kubernetes", "Terraform", "Go"], status: "new", resumeVersions: 1, lastActivity: "5h ago", consent: false },
  { id: "c5", name: "Priya Nair", title: "ML Engineer", location: "Seattle, WA", email: "priya.n@example.test", skills: ["PyTorch", "MLOps", "Python"], status: "contacted", resumeVersions: 2, lastActivity: "6h ago", consent: true },
  { id: "c6", name: "Jordan Blake", title: "Engineering Manager", location: "Remote (US)", email: "jordan.b@example.test", skills: ["Leadership", "Hiring", "Go"], status: "screening", resumeVersions: 1, lastActivity: "2d ago", consent: true },
  { id: "c7", name: "Sofia Marchetti", title: "Product Designer", location: "New York, NY", email: "sofia.m@example.test", skills: ["Figma", "Design Systems"], status: "new", resumeVersions: 1, lastActivity: "30m ago", consent: false },
  { id: "c8", name: "Wei Chen", title: "Security Engineer", location: "San Jose, CA", email: "wei.c@example.test", skills: ["AppSec", "Python", "Threat Modeling"], status: "submitted", resumeVersions: 2, lastActivity: "1w ago", consent: true },
];

export const statusLabel: Record<CandidateStatus, string> = {
  new: "New",
  contacted: "Contacted",
  screening: "Screening",
  submitted: "Submitted",
};

export interface Requisition {
  id: string;
  title: string;
  client: string;
  openings: number;
  inPipeline: number;
}

export const requisitions: Requisition[] = [
  { id: "r1", title: "Senior Backend Engineer", client: "Northwind Robotics", openings: 2, inPipeline: 14 },
  { id: "r2", title: "Staff Frontend Engineer", client: "Helios Health", openings: 1, inPipeline: 9 },
  { id: "r3", title: "Data Platform Lead", client: "Atlas Freight", openings: 1, inPipeline: 6 },
];

export const stats = {
  candidates: 2847,
  activeReqs: 18,
  emailsSent30d: 1240,
  responseRate: "31%",
};

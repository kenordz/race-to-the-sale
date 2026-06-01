// Mock data pool for the lead generator. In production these come from
// DriveCentric (ADF/XML feed). For now we hard-code a small pool so the
// demo feels populated without leaning on a third-party integration.

export const MOCK_LEAD_SOURCES = [
  "website",
  "phone_up",
  "walk_in",
  "text",
  "chat",
  "social",
] as const;

export type MockLeadSource = (typeof MOCK_LEAD_SOURCES)[number];

export const MOCK_CUSTOMER_NAMES = [
  "Maria Garcia",
  "John Smith",
  "Carlos Rodriguez",
  "Sarah Johnson",
  "David Chen",
  "Jessica Martinez",
  "Michael Brown",
  "Linda Nguyen",
  "Robert Wilson",
  "Emily Lopez",
  "Daniel Patel",
  "Ashley Williams",
  "Jose Hernandez",
  "Amanda Thompson",
  "Kevin Park",
  "Stephanie Davis",
  "Brandon Miller",
  "Nicole Sanchez",
  "Christopher Taylor",
  "Rebecca Cohen",
  "Andre Williams",
  "Priya Iyer",
  "Marcus King",
  "Gabriela Ramos",
  "Tyler Anderson",
] as const;

export const MOCK_VEHICLE_INTERESTS = [
  "2024 Ford F-150",
  "Honda Civic 2023",
  "Nissan Sentra",
  "Toyota RAV4 Hybrid",
  "Chevrolet Silverado 1500",
  "Tesla Model 3",
  "Mazda CX-5",
  "Hyundai Tucson",
  "Jeep Wrangler",
  "Kia Telluride",
  "Subaru Outback",
  "Ram 1500",
  "Volkswagen Jetta",
  "Ford Bronco",
  "Toyota Camry",
  "Honda Pilot",
  "GMC Sierra",
  "Chevrolet Equinox",
  "Hyundai Elantra",
  "Mazda 3",
] as const;

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Derive a fake @example.com email from a mock customer's full name so each
// customer carries an email through the pipeline. The actual outbound
// recipient is still EMAIL_TEST_RECIPIENT in dev (see sendLeadEmail),
// because we do not want test emails landing in @example.com inboxes.
export function mockEmailFor(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug}@example.com`;
}

export function formatSourceLabel(source: string): string {
  // 'phone_up' -> 'PHONE UP', 'walk_in' -> 'WALK-IN', 'third_party' -> 'THIRD PARTY'
  if (source === "walk_in") return "WALK-IN";
  return source.replace(/_/g, " ").toUpperCase();
}

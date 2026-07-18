import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/loan_origination",
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const users = [
  {
    email: "borrower@example.com",
    fullName: "Priya Borrower",
    role: "BORROWER",
  },
  {
    email: "coapplicant@example.com",
    fullName: "Marcus Coapplicant",
    role: "BORROWER",
  },
  {
    email: "officer@example.com",
    fullName: "Elena Officer",
    role: "LOAN_OFFICER",
  },
  {
    email: "underwriter@example.com",
    fullName: "Jordan Underwriter",
    role: "UNDERWRITER",
  },
  {
    email: "ops@example.com",
    fullName: "Sofia Operations",
    role: "OPERATIONS_MANAGER",
  },
  {
    email: "servicing@example.com",
    fullName: "Riley Servicing",
    role: "SERVICING_AGENT",
  },
] as const;

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.externalWorkflowEvent.deleteMany();
  await prisma.applicationTransition.deleteMany();
  await prisma.underwritingCondition.deleteMany();
  await prisma.verificationRequest.deleteMany();
  await prisma.applicationParty.deleteMany();
  await prisma.loanApplication.deleteMany();
  await prisma.user.deleteMany();

  const createdUsers = await Promise.all(
    users.map((user) =>
      prisma.user.create({
        data: user,
      }),
    ),
  );

  const borrower = createdUsers.find((user) => user.email === "borrower@example.com")!;
  const coApplicant = createdUsers.find((user) => user.email === "coapplicant@example.com")!;
  const officer = createdUsers.find((user) => user.email === "officer@example.com")!;
  const underwriter = createdUsers.find((user) => user.email === "underwriter@example.com")!;
  const ops = createdUsers.find((user) => user.email === "ops@example.com")!;

  const seededApplication = await prisma.loanApplication.create({
    data: {
      publicId: "APP-1001",
      productType: "CONVENTIONAL",
      purpose: "Primary residence purchase",
      requestedAmount: "425000",
      stage: "CONDITIONS",
      decisionOutcome: "APPROVED",
      stageReason: "Approved with income and homeowner insurance conditions outstanding.",
      intakeCompletedAt: new Date("2026-04-02T17:00:00.000Z"),
      approvedAt: new Date("2026-04-09T21:30:00.000Z"),
      createdById: borrower.id,
      assignedOfficerId: officer.id,
      parties: {
        create: [
          {
            role: "PRIMARY",
            userId: borrower.id,
            firstName: "Priya",
            lastName: "Borrower",
            email: borrower.email,
            annualIncome: "155000",
          },
          {
            role: "CO_APPLICANT",
            userId: coApplicant.id,
            firstName: "Marcus",
            lastName: "Coapplicant",
            email: coApplicant.email,
            annualIncome: "93000",
          },
        ],
      },
      verifications: {
        create: [
          {
            type: "CREDIT_PULL",
            status: "PASSED",
            providerReference: "CR-401",
            providerSequence: 2,
            summary: "Tri-merge score package cleared by policy.",
            startedAt: new Date("2026-04-03T18:00:00.000Z"),
            completedAt: new Date("2026-04-03T18:08:00.000Z"),
          },
          {
            type: "DOCUMENT_CHECK",
            status: "PASSED",
            providerReference: "DOC-991",
            providerSequence: 1,
            summary: "Uploaded disclosures and ID package validated.",
            startedAt: new Date("2026-04-03T18:10:00.000Z"),
            completedAt: new Date("2026-04-03T18:20:00.000Z"),
          },
          {
            type: "EMPLOYMENT_CHECK",
            status: "PASSED",
            providerReference: "EMP-772",
            providerSequence: 1,
            summary: "Employer and income verification matched paystubs.",
            startedAt: new Date("2026-04-03T18:12:00.000Z"),
            completedAt: new Date("2026-04-03T18:27:00.000Z"),
          },
        ],
      },
      conditions: {
        create: [
          {
            title: "Collect updated bank statements",
            description: "Need the two most recent statements before closing.",
            status: "OPEN",
            createdById: underwriter.id,
          },
          {
            title: "Upload homeowner insurance binder",
            description: "Policy evidence must be received before funds can be scheduled.",
            status: "SATISFIED",
            resolvedAt: new Date("2026-04-10T15:00:00.000Z"),
            createdById: underwriter.id,
            resolvedById: officer.id,
          },
        ],
      },
      transitions: {
        create: [
          {
            fromStage: "INTAKE",
            toStage: "VERIFICATION",
            reason: "Borrower submitted intake package.",
            triggeredById: borrower.id,
          },
          {
            fromStage: "VERIFICATION",
            toStage: "CREDIT_DECISIONING",
            reason: "All required verification checks passed.",
            triggeredBySystem: true,
          },
          {
            fromStage: "CREDIT_DECISIONING",
            toStage: "CONDITIONS",
            reason: "Underwriter approved subject to final conditions.",
            triggeredById: underwriter.id,
          },
        ],
      },
      auditLogs: {
        create: [
          {
            actorUserId: borrower.id,
            action: "APPLICATION_CREATED",
            entityType: "LoanApplication",
            entityId: "APP-1001",
            summary: "Borrower created the initial loan application.",
          },
          {
            actorUserId: ops.id,
            action: "SERVICING_PREPARED",
            entityType: "LoanApplication",
            entityId: "APP-1001",
            summary: "Operations reviewed the file for eventual servicing transfer.",
          },
        ],
      },
    },
  });

  await prisma.externalWorkflowEvent.create({
    data: {
      applicationId: seededApplication.id,
      eventType: "CREDIT_RESULT",
      providerSequence: 2,
      providerStatus: "PASSED",
      summary: "Most recent credit package applied to workflow.",
      payload: {
        bureau: "TriMerge",
        recommendation: "Accept",
      },
      appliedToWorkflow: true,
      occurredAt: new Date("2026-04-03T18:08:00.000Z"),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

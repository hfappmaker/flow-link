import assert from "node:assert/strict";
import test from "node:test";

const { getResumeDocumentReadAccess } = await import("../src/lib/document-access.ts");

const document = {
  id: "document-1",
  fileUrl: "resume-document-url",
  originalFilename: "resume.pdf",
  freelancerProfile: { userId: "freelancer-user-1" },
};

function accessDb({ foundDocument = document, appliedCompanyCount = 0 } = {}) {
  const calls = [];
  return {
    calls,
    resumeDocument: {
      findUnique: async (args) => {
        calls.push(["resumeDocument.findUnique", args]);
        return foundDocument;
      },
      count: async (args) => {
        calls.push(["resumeDocument.count", args]);
        return appliedCompanyCount;
      },
    },
  };
}

test("resume document access denies unauthenticated requests before reading documents", async () => {
  const db = accessDb();

  const access = await getResumeDocumentReadAccess(db, {
    documentId: "document-1",
    userId: null,
  });

  assert.deepEqual(access, { status: "unauthenticated" });
  assert.deepEqual(db.calls, []);
});

test("resume document access reports missing documents", async () => {
  const db = accessDb({ foundDocument: null });

  const access = await getResumeDocumentReadAccess(db, {
    documentId: "missing-document",
    userId: "freelancer-user-1",
  });

  assert.deepEqual(access, { status: "not_found" });
  assert.deepEqual(db.calls, [
    [
      "resumeDocument.findUnique",
      {
        where: { id: "missing-document" },
        select: {
          id: true,
          fileUrl: true,
          originalFilename: true,
          freelancerProfile: { select: { userId: true } },
        },
      },
    ],
  ]);
});

test("resume document access allows the freelancer owner", async () => {
  const db = accessDb();

  const access = await getResumeDocumentReadAccess(db, {
    documentId: "document-1",
    userId: "freelancer-user-1",
  });

  assert.deepEqual(access, { status: "allowed", document });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0][0], "resumeDocument.findUnique");
});

test("resume document access allows a company user through an applied job", async () => {
  const db = accessDb({ appliedCompanyCount: 1 });

  const access = await getResumeDocumentReadAccess(db, {
    documentId: "document-1",
    userId: "company-user-1",
  });

  assert.deepEqual(access, { status: "allowed", document });
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls[1], [
    "resumeDocument.count",
    {
      where: {
        id: "document-1",
        freelancerProfile: {
          applications: {
            some: {
              jobPost: {
                companyProfile: {
                  users: { some: { userId: "company-user-1" } },
                },
              },
            },
          },
        },
      },
    },
  ]);
});

test("resume document access denies unrelated company users", async () => {
  const db = accessDb({ appliedCompanyCount: 0 });

  const access = await getResumeDocumentReadAccess(db, {
    documentId: "document-1",
    userId: "unrelated-company-user",
  });

  assert.deepEqual(access, { status: "forbidden" });
  assert.equal(db.calls.length, 2);
});

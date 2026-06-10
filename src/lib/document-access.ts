type ResumeDocumentForRead = {
  id: string;
  fileUrl: string;
  originalFilename: string;
  freelancerProfile: { userId: string };
};

type ResumeDocumentAccessDb = {
  resumeDocument: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        fileUrl: true;
        originalFilename: true;
        freelancerProfile: { select: { userId: true } };
      };
    }): Promise<ResumeDocumentForRead | null>;
    count(args: {
      where: {
        id: string;
        freelancerProfile: {
          applications: {
            some: {
              jobPost: {
                companyProfile: {
                  users: { some: { userId: string } };
                };
              };
            };
          };
        };
      };
    }): Promise<number>;
  };
};

export type ResumeDocumentReadAccess =
  | { status: "allowed"; document: ResumeDocumentForRead }
  | { status: "unauthenticated" | "not_found" | "forbidden" };

export async function getResumeDocumentReadAccess(
  db: ResumeDocumentAccessDb,
  input: { documentId: string; userId: string | null | undefined },
): Promise<ResumeDocumentReadAccess> {
  const { documentId, userId } = input;
  if (!userId) return { status: "unauthenticated" };

  const document = await db.resumeDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      fileUrl: true,
      originalFilename: true,
      freelancerProfile: { select: { userId: true } },
    },
  });
  if (!document) return { status: "not_found" };
  if (document.freelancerProfile.userId === userId) return { status: "allowed", document };

  const appliedCompanyDocuments = await db.resumeDocument.count({
    where: {
      id: documentId,
      freelancerProfile: {
        applications: {
          some: {
            jobPost: {
              companyProfile: {
                users: { some: { userId } },
              },
            },
          },
        },
      },
    },
  });

  if (appliedCompanyDocuments > 0) return { status: "allowed", document };
  return { status: "forbidden" };
}

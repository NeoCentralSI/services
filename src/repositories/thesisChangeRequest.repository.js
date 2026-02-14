import prisma from '../config/prisma.js';

/**
 * Create a new thesis change request
 */
export const create = async (data) => {
  return await prisma.thesisChangeRequest.create({
    data,
    include: {
      thesis: {
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  identityNumber: true,
                  email: true,
                },
              },
            },
          },
          thesisTopic: true,
          thesisSupervisors: {
            include: {
              lecturer: {
                include: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                    },
                  },
                },
              },
              role: true,
            },
          },
        },
      },
      approvals: {
        include: {
          lecturer: {
            include: {
              user: {
                select: { id: true, fullName: true }
              }
            }
          }
        }
      }
    },
  });
};

/**
 * Find change request by ID
 */
export const findById = async (id) => {
  return await prisma.thesisChangeRequest.findUnique({
    where: { id },
    include: {
      thesis: {
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  identityNumber: true,
                  email: true,
                },
              },
            },
          },
          thesisTopic: true,
          thesisSupervisors: {
            include: {
              lecturer: {
                include: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                    },
                  },
                },
              },
              role: true,
            },
          },
        },
      },
      reviewer: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      approvals: {
        include: {
          lecturer: {
            include: {
              user: {
                select: { id: true, fullName: true }
              }
            }
          }
        }
      }
    },
  });
};

/**
 * Find change request by thesis ID
 */
export const findByThesisId = async (thesisId) => {
  return await prisma.thesisChangeRequest.findMany({
    where: { thesisId },
    orderBy: { createdAt: 'desc' },
    include: {
      reviewer: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      approvals: {
        include: {
          lecturer: {
            include: {
              user: {
                select: { id: true, fullName: true }
              }
            }
          }
        }
      },
    },
  });
};

/**
 * Find change requests by student's user ID (via thesis relation)
 */
export const findByStudentId = async (userId) => {
  return await prisma.thesisChangeRequest.findMany({
    where: {
      thesis: {
        student: {
          user: { id: userId },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      thesis: {
        include: {
          thesisTopic: true,
        },
      },
      reviewer: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      approvals: {
        include: {
          lecturer: {
            include: {
              user: {
                select: { id: true, fullName: true }
              }
            }
          }
        }
      },
    },
  });
};

/**
 * Find approved change request for student where thesis was deleted.
 * Note: Since studentId was removed from the model, this queries via thesis relation.
 * Requests with thesisId=null (deleted thesis) cannot be traced back to a student.
 */
export const findApprovedWithDeletedThesis = async (userId) => {
  // First find approved requests with null thesisId is not possible without studentId.
  // Instead, check for approved change_topic/change_supervisor requests where thesis still exists
  // but was soft-linked. Since orphaned requests can't be found, return null.
  return null;
};

/**
 * Find pending request by thesis ID
 */
export const findPendingByThesisId = async (thesisId) => {
  return await prisma.thesisChangeRequest.findFirst({
    where: {
      thesisId,
      status: 'pending',
    },
  });
};

/**
 * Find all pending requests (for Kadep)
 */
export const findAllPending = async ({ page = 1, pageSize = 10, search = '' }) => {
  const skip = (page - 1) * pageSize;

  const where = {
    status: 'pending',
    ...(search && {
      thesis: {
        student: {
          user: {
            OR: [
              { fullName: { contains: search } },
              { identityNumber: { contains: search } },
            ],
          },
        },
      },
    }),
  };

  const [data, total] = await Promise.all([
    prisma.thesisChangeRequest.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
      include: {
        thesis: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    identityNumber: true,
                    email: true,
                  },
                },
              },
            },
            thesisTopic: true,
            thesisSupervisors: {
              include: {
                lecturer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        fullName: true,
                      },
                    },
                  },
                },
                role: true,
              },
            },
          },
        },
        approvals: {
          include: {
            lecturer: {
              include: {
                user: {
                  select: { id: true, fullName: true }
                }
              }
            }
          }
        },
      },
    }),
    prisma.thesisChangeRequest.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

/**
 * Find all requests with filters
 */
export const findAll = async ({ page = 1, pageSize = 10, search = '', status = '' }) => {
  const skip = (page - 1) * pageSize;

  const where = {
    ...(status && { status }),
    ...(search && {
      thesis: {
        student: {
          user: {
            OR: [
              { fullName: { contains: search } },
              { identityNumber: { contains: search } },
            ],
          },
        },
      },
    }),
  };

  const [data, total] = await Promise.all([
    prisma.thesisChangeRequest.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        thesis: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    identityNumber: true,
                    email: true,
                  },
                },
              },
            },
            thesisTopic: true,
            thesisSupervisors: {
              include: {
                lecturer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        fullName: true,
                      },
                    },
                  },
                },
                role: true,
              },
            },
          },
        },
        reviewer: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        approvals: {
          include: {
            lecturer: {
              include: {
                user: {
                  select: { id: true, fullName: true }
                }
              }
            }
          }
        },
      },
    }),
    prisma.thesisChangeRequest.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

/**
 * Update change request
 */
export const update = async (id, data) => {
  return await prisma.thesisChangeRequest.update({
    where: { id },
    data,
    include: {
      thesis: {
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  identityNumber: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      reviewer: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Count pending requests
 */
export const countPending = async () => {
  return await prisma.thesisChangeRequest.count({
    where: { status: 'pending' },
  });
};

/**
 * Update request approval status
 */
export const updateApproval = async (requestId, lecturerId, status, notes) => {
  return await prisma.thesisChangeRequestApproval.update({
    where: {
      requestId_lecturerId: {
        requestId,
        lecturerId
      }
    },
    data: {
      status,
      notes,
    }
  });
};

/**
 * Find pending change request by thesis ID for a specific lecturer
 * Used to check if lecturer needs to review a change request
 */
export const findPendingForLecturerByThesisId = async (thesisId, lecturerId) => {
  return await prisma.thesisChangeRequest.findFirst({
    where: {
      thesisId,
      status: 'pending',
      approvals: {
        some: {
          lecturerId,
          status: 'pending'
        }
      }
    },
    include: {
      thesis: {
        include: {
          student: {
            include: {
              user: {
                select: { id: true, fullName: true, identityNumber: true }
              }
            }
          }
        }
      },
      approvals: {
        include: {
          lecturer: {
            include: {
              user: {
                select: { id: true, fullName: true }
              }
            }
          }
        }
      }
    }
  });
};

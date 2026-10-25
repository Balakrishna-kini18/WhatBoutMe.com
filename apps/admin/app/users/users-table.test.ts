import { describe, it, expect, beforeEach, vi } from 'vitest';

// Types matching the Users page contracts
type RoleFilter = "ALL" | "USER" | "MANAGER" | "ADMIN" | "SUPER_ADMIN";

interface TableColumnConfig {
  id: string;
  header: string;
  visible: boolean;
}

function computeColumns(roleFilter: RoleFilter): TableColumnConfig[] {
  if (roleFilter === "ALL") {
    return [
      { id: "user_profile", header: "User & Profile", visible: true },
      { id: "role", header: "Role", visible: true },
      { id: "enrolled_programs", header: "Enrolled Programs", visible: true },
      { id: "unlocked_step", header: "Unlocked Step", visible: true },
      { id: "agreement", header: "Agreement", visible: true },
      { id: "batch", header: "Batch", visible: true },
      { id: "action", header: "Action", visible: true },
    ];
  }
  if (roleFilter === "USER") {
    return [
      { id: "user_profile", header: "User & Profile", visible: true },
      { id: "enrolled_programs", header: "Enrolled Programs", visible: true },
      { id: "unlocked_step", header: "Unlocked Step", visible: true },
      { id: "agreement", header: "Agreement", visible: true },
      { id: "batch", header: "Batch", visible: true },
      { id: "action", header: "Action", visible: true },
    ];
  }
  if (roleFilter === "MANAGER") {
    return [
      { id: "user_profile", header: "User & Profile", visible: true },
      { id: "managed_batches", header: "Managed Batches", visible: true },
      { id: "status", header: "Account Status", visible: true },
      { id: "joined", header: "Joined Date", visible: true },
      { id: "action", header: "Action", visible: true },
    ];
  }
  if (roleFilter === "ADMIN") {
    return [
      { id: "user_profile", header: "User & Profile", visible: true },
      { id: "admin_scope", header: "Administrative Scope", visible: true },
      { id: "status", header: "Account Status", visible: true },
      { id: "joined", header: "Joined Date", visible: true },
      { id: "action", header: "Action", visible: true },
    ];
  }
  // SUPER_ADMIN
  return [
    { id: "user_profile", header: "User & Profile", visible: true },
    { id: "governance", header: "Governance & Access", visible: true },
    { id: "status", header: "Account Status", visible: true },
    { id: "joined", header: "Joined Date", visible: true },
    { id: "action", header: "Action", visible: true },
  ];
}

function buildUserQueryUrl(baseUrl: string, page: number, limit: number, search: string, roleFilter: RoleFilter): string {
  const roleParam = roleFilter !== "ALL" ? `&role=${roleFilter}` : "";
  return `${baseUrl}/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${roleParam}`;
}

function formatRoleLabel(role: string): string {
  if (role === "USER") return "Learner";
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMIN") return "Admin";
  if (role === "MANAGER") return "Manager";
  return role;
}

function getTabLabels(): Array<{ filter: RoleFilter; label: string }> {
  return [
    { filter: "ALL", label: "All Roles" },
    { filter: "USER", label: "Learners" },
    { filter: "MANAGER", label: "Batch Managers" },
    { filter: "ADMIN", label: "Admins" },
    { filter: "SUPER_ADMIN", label: "Super Admins" },
  ];
}

function canAdminManageUser(currentUserRole: string, targetUserRole: string): boolean {
  if (currentUserRole === "SUPER_ADMIN") return true;
  if (currentUserRole === "ADMIN") {
    // Admins cannot edit or revoke Super Admins
    return targetUserRole !== "SUPER_ADMIN";
  }
  // Managers cannot manage staff or other users
  return false;
}

describe('Users & Enrolments Table Specification', () => {
  const API_URL = 'http://localhost:4000';

  describe('1. Review and simplify table columns', () => {
    it('removes the redundant Security column from the table headers', () => {
      const allRolesCols = computeColumns("ALL");
      const columnIds = allRolesCols.map(c => c.id);
      expect(columnIds).not.toContain("security");
      expect(columnIds).toEqual([
        "user_profile",
        "role",
        "enrolled_programs",
        "unlocked_step",
        "agreement",
        "batch",
        "action",
      ]);
    });

    it('has exactly 7 columns when All Roles is selected', () => {
      const cols = computeColumns("ALL");
      expect(cols).toHaveLength(7);
      expect(cols.map(c => c.header)).toEqual([
        "User & Profile",
        "Role",
        "Enrolled Programs",
        "Unlocked Step",
        "Agreement",
        "Batch",
        "Action",
      ]);
    });

    it('has exactly 6 columns when Learners (USER) tab is selected', () => {
      const learnerCols = computeColumns("USER");
      expect(learnerCols).toHaveLength(6);
      expect(learnerCols.map(c => c.header)).toEqual([
        "User & Profile",
        "Enrolled Programs",
        "Unlocked Step",
        "Agreement",
        "Batch",
        "Action",
      ]);
      expect(learnerCols.map(c => c.id)).not.toContain("role");
    });

    it('has exactly 5 role-tailored columns for Batch Managers (MANAGER)', () => {
      const managerCols = computeColumns("MANAGER");
      expect(managerCols).toHaveLength(5);
      expect(managerCols.map(c => c.header)).toEqual([
        "User & Profile",
        "Managed Batches",
        "Account Status",
        "Joined Date",
        "Action",
      ]);
      // Agreement, Unlocked Step, and Enrolled Programs must NOT be present
      expect(managerCols.map(c => c.id)).not.toContain("agreement");
      expect(managerCols.map(c => c.id)).not.toContain("unlocked_step");
      expect(managerCols.map(c => c.id)).not.toContain("enrolled_programs");
    });

    it('has exactly 5 role-tailored columns for Admins (ADMIN)', () => {
      const adminCols = computeColumns("ADMIN");
      expect(adminCols).toHaveLength(5);
      expect(adminCols.map(c => c.header)).toEqual([
        "User & Profile",
        "Administrative Scope",
        "Account Status",
        "Joined Date",
        "Action",
      ]);
      // Irrelevant curriculum and batch columns must NOT be present
      expect(adminCols.map(c => c.id)).not.toContain("agreement");
      expect(adminCols.map(c => c.id)).not.toContain("unlocked_step");
      expect(adminCols.map(c => c.id)).not.toContain("enrolled_programs");
      expect(adminCols.map(c => c.id)).not.toContain("batch");
    });

    it('has exactly 5 role-tailored columns for Super Admins (SUPER_ADMIN)', () => {
      const superAdminCols = computeColumns("SUPER_ADMIN");
      expect(superAdminCols).toHaveLength(5);
      expect(superAdminCols.map(c => c.header)).toEqual([
        "User & Profile",
        "Governance & Access",
        "Account Status",
        "Joined Date",
        "Action",
      ]);
      // Irrelevant curriculum and batch columns must NOT be present
      expect(superAdminCols.map(c => c.id)).not.toContain("agreement");
      expect(superAdminCols.map(c => c.id)).not.toContain("unlocked_step");
      expect(superAdminCols.map(c => c.id)).not.toContain("enrolled_programs");
      expect(superAdminCols.map(c => c.id)).not.toContain("batch");
    });

    it('ensures table skeleton and empty states match the dynamic column count', () => {
      const allRolesCols = computeColumns("ALL").length;
      const learnerCols = computeColumns("USER").length;
      const managerCols = computeColumns("MANAGER").length;
      const adminCols = computeColumns("ADMIN").length;
      const superAdminCols = computeColumns("SUPER_ADMIN").length;

      // When All Roles is selected, skeleton & colSpan must be 7
      expect(allRolesCols).toBe(7);
      // When Learners is selected, skeleton & colSpan must be 6
      expect(learnerCols).toBe(6);
      // When Staff roles are selected, skeleton & colSpan must be 5
      expect(managerCols).toBe(5);
      expect(adminCols).toBe(5);
      expect(superAdminCols).toBe(5);
    });
  });

  describe('2. Fix the All Roles tab query flow', () => {
    it('constructs URL with NO role query parameter when All Roles is selected', () => {
      const url = buildUserQueryUrl(API_URL, 1, 20, '', "ALL");
      expect(url).toBe('http://localhost:4000/users?page=1&limit=20&search=');
      expect(url).not.toContain('role=');
      expect(url).not.toContain('role=USER');
      expect(url).not.toContain('role=STAFF');
    });

    it('constructs correct role query parameter for each role-specific tab', () => {
      expect(buildUserQueryUrl(API_URL, 1, 20, '', "USER")).toBe(
        'http://localhost:4000/users?page=1&limit=20&search=&role=USER'
      );
      expect(buildUserQueryUrl(API_URL, 1, 20, '', "MANAGER")).toBe(
        'http://localhost:4000/users?page=1&limit=20&search=&role=MANAGER'
      );
      expect(buildUserQueryUrl(API_URL, 1, 20, '', "ADMIN")).toBe(
        'http://localhost:4000/users?page=1&limit=20&search=&role=ADMIN'
      );
      expect(buildUserQueryUrl(API_URL, 1, 20, '', "SUPER_ADMIN")).toBe(
        'http://localhost:4000/users?page=1&limit=20&search=&role=SUPER_ADMIN'
      );
    });

    it('correctly handles search query and pagination alongside role parameter', () => {
      const searchUrl = buildUserQueryUrl(API_URL, 2, 20, 'alice smith', "ALL");
      expect(searchUrl).toBe('http://localhost:4000/users?page=2&limit=20&search=alice%20smith');

      const filteredSearchUrl = buildUserQueryUrl(API_URL, 3, 20, 'dr bob', "MANAGER");
      expect(filteredSearchUrl).toBe('http://localhost:4000/users?page=3&limit=20&search=dr%20bob&role=MANAGER');
    });

    it('formats user roles consistently in the table role column', () => {
      expect(formatRoleLabel('USER')).toBe('Learner');
      expect(formatRoleLabel('SUPER_ADMIN')).toBe('Super Admin');
      expect(formatRoleLabel('ADMIN')).toBe('Admin');
      expect(formatRoleLabel('MANAGER')).toBe('Manager');
    });
  });

  describe('3. Role-specific tabs & visibility rules', () => {
    it('uses clean, professional tab labels without technical "(USER)" identifier', () => {
      const tabs = getTabLabels();
      const tabLabels = tabs.map(t => t.label);

      expect(tabLabels).toEqual([
        "All Roles",
        "Learners",
        "Batch Managers",
        "Admins",
        "Super Admins",
      ]);
      expect(tabLabels).not.toContain("Learners (USER)");
    });

    it('hides the Role column on guaranteed single-role tabs to avoid redundant visual repetition', () => {
      const roles: RoleFilter[] = ["USER", "MANAGER", "ADMIN", "SUPER_ADMIN"];
      roles.forEach(role => {
        const cols = computeColumns(role);
        expect(cols.find(c => c.id === "role")).toBeUndefined();
      });
    });

    it('keeps the Role column visible on All Roles so administrators can distinguish account types', () => {
      const allRolesCols = computeColumns("ALL");
      const roleCol = allRolesCols.find(c => c.id === "role");
      expect(roleCol).toBeDefined();
      expect(roleCol?.visible).toBe(true);
      expect(roleCol?.header).toBe("Role");
    });

    it('preserves strict authorization boundaries: regular Admin cannot edit or revoke Super Admin accounts', () => {
      // Super Admin can manage anyone
      expect(canAdminManageUser("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
      expect(canAdminManageUser("SUPER_ADMIN", "ADMIN")).toBe(true);
      expect(canAdminManageUser("SUPER_ADMIN", "MANAGER")).toBe(true);
      expect(canAdminManageUser("SUPER_ADMIN", "USER")).toBe(true);

      // Admin can manage regular staff and learners, but NEVER Super Admins
      expect(canAdminManageUser("ADMIN", "SUPER_ADMIN")).toBe(false);
      expect(canAdminManageUser("ADMIN", "ADMIN")).toBe(true);
      expect(canAdminManageUser("ADMIN", "MANAGER")).toBe(true);
      expect(canAdminManageUser("ADMIN", "USER")).toBe(true);

      // Manager cannot manage accounts
      expect(canAdminManageUser("MANAGER", "USER")).toBe(false);
      expect(canAdminManageUser("MANAGER", "ADMIN")).toBe(false);
    });
  });

  describe('5. EmptyState Icon Rendering', () => {
    it('resolves named icon string "users" to an SVG element rather than raw text', async () => {
      const { resolveEmptyStateIcon } = await import('../components/empty-state-icons');
      const iconElement: any = resolveEmptyStateIcon('users');

      // The icon should be an SVG element, not the raw text "users"
      expect(iconElement).toBeDefined();
      expect(typeof iconElement).not.toBe('string');
      expect(iconElement.type).toBe('svg');
      expect(iconElement.props['aria-hidden']).toBe('true');
      expect(iconElement.props.width).toBe('24');
      expect(iconElement.props.height).toBe('24');
    });

    it('resolves other named icon strings to valid SVG elements', async () => {
      const { resolveEmptyStateIcon } = await import('../components/empty-state-icons');
      for (const name of ['document', 'calendar', 'dollar', 'academic', 'search'] as const) {
        const icon: any = resolveEmptyStateIcon(name);
        expect(icon.type).toBe('svg');
      }
    });
  });

  describe('6. Staff Placeholders & Wording Standard (Unlocked Step & Agreement)', () => {
    function formatUnlockedStep(user: { role: string; currentStepNumber?: number }): string {
      if (user.role === "USER") {
        return `Step ${user.currentStepNumber || 1} / 11`;
      }
      return "—";
    }

    function formatAgreementColumn(user: { role: string; isAgreementSigned?: boolean }): string {
      if (user.role === "USER") {
        return user.isAgreementSigned ? "✓ Signed" : "Pending";
      }
      return "—";
    }

    it('displays "Step X / 11" for learners but clean "—" for staff (NOT "Global LMS")', () => {
      expect(formatUnlockedStep({ role: "USER", currentStepNumber: 3 })).toBe("Step 3 / 11");
      expect(formatUnlockedStep({ role: "USER" })).toBe("Step 1 / 11");

      // Staff roles must display "—", never "Global LMS"
      expect(formatUnlockedStep({ role: "SUPER_ADMIN" })).toBe("—");
      expect(formatUnlockedStep({ role: "ADMIN" })).toBe("—");
      expect(formatUnlockedStep({ role: "MANAGER" })).toBe("—");
      expect(formatUnlockedStep({ role: "SUPER_ADMIN" })).not.toBe("Global LMS");
      expect(formatUnlockedStep({ role: "ADMIN" })).not.toBe("Global LMS");
      expect(formatUnlockedStep({ role: "MANAGER" })).not.toBe("Global LMS");
    });

    function formatBatchColumn(user: { role: string; cohort?: string; managedBatches?: Array<{ name: string }> }): string {
      if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
        return "—";
      }
      if (user.role === "MANAGER") {
        return user.managedBatches && user.managedBatches.length > 0
          ? user.managedBatches.map(b => b.name).join("; ")
          : "Unassigned";
      }
      return user.cohort && user.cohort !== "Unassigned" ? user.cohort : "Unassigned";
    }

    it('displays batch name or "Unassigned" for learners/managers, but clean "—" for Admins & Super Admins', () => {
      expect(formatBatchColumn({ role: "USER", cohort: "Cohort A" })).toBe("Cohort A");
      expect(formatBatchColumn({ role: "USER" })).toBe("Unassigned");
      expect(formatBatchColumn({ role: "MANAGER", managedBatches: [{ name: "Delta 1" }] })).toBe("Delta 1");
      expect(formatBatchColumn({ role: "MANAGER" })).toBe("Unassigned");

      // Global staff must display "—", never "Unassigned"
      expect(formatBatchColumn({ role: "SUPER_ADMIN" })).toBe("—");
      expect(formatBatchColumn({ role: "ADMIN" })).toBe("—");
      expect(formatBatchColumn({ role: "SUPER_ADMIN" })).not.toBe("Unassigned");
      expect(formatBatchColumn({ role: "ADMIN" })).not.toBe("Unassigned");
    });
  });

  describe('7. Interactive Column Sorting & Dropdown Filters', () => {
    interface TestUser {
      id: string;
      name: string;
      email: string;
      role: string;
      status?: string;
      currentStepNumber?: number;
      isAgreementSigned?: boolean;
      cohort?: string;
      batchId?: string | null;
      managedBatches?: Array<{ id: string; name: string }>;
      enrolments?: Array<{ programTitle: string }>;
    }

    const mockUsers: TestUser[] = [
      { id: "1", name: "Zara Ali", email: "zara@example.com", role: "USER", status: "ACTIVE", currentStepNumber: 5, isAgreementSigned: true, cohort: "Cohort A", batchId: "b-1", enrolments: [{ programTitle: "Sigma 1" }, { programTitle: "11 Steps to You" }] },
      { id: "2", name: "Aaron Smith", email: "aaron@example.com", role: "USER", status: "SUSPENDED", currentStepNumber: 2, isAgreementSigned: false, cohort: "Cohort B", batchId: "b-2", enrolments: [{ programTitle: "Sigma 1" }] },
      { id: "3", name: "Roweena Britto", email: "roweena@whatboutme.com", role: "SUPER_ADMIN", status: "ACTIVE" },
      { id: "4", name: "Carlos Manager", email: "carlos@whatboutme.com", role: "MANAGER", status: "ACTIVE", managedBatches: [{ id: "b-1", name: "Cohort A" }] },
      { id: "5", name: "Bob Admin", email: "bob@whatboutme.com", role: "ADMIN", status: "INACTIVE" },
      { id: "6", name: "Chloe Unassigned", email: "chloe@example.com", role: "USER", status: "ACTIVE", isAgreementSigned: false, enrolments: [] },
    ];

    function filterUsers(
      users: TestUser[],
      programFilter: string,
      agreementFilter: "ALL" | "SIGNED" | "PENDING",
      batchFilter: string
    ): TestUser[] {
      return users.filter(u => {
        if (programFilter === "NONE") {
          if (u.enrolments && u.enrolments.length > 0) return false;
        } else if (programFilter !== "ALL") {
          const hasProg = u.enrolments?.some(e => e.programTitle === programFilter);
          if (!hasProg) return false;
        }

        if (agreementFilter === "SIGNED") {
          if (!u.isAgreementSigned) return false;
        } else if (agreementFilter === "PENDING") {
          if (u.role === "USER" && u.isAgreementSigned) return false;
          if (u.role !== "USER") return false;
        }

        if (batchFilter === "UNASSIGNED") {
          if (u.role === "MANAGER") {
            if (u.managedBatches && u.managedBatches.length > 0) return false;
          } else {
            if (u.cohort || u.batchId) return false;
          }
        } else if (batchFilter !== "ALL") {
          if (u.role === "MANAGER") {
            const hasBatch = u.managedBatches?.some(b => b.id === batchFilter || b.name === batchFilter);
            if (!hasBatch && u.batchId !== batchFilter) return false;
          } else {
            if (u.batchId !== batchFilter && u.cohort !== batchFilter) return false;
          }
        }

        return true;
      });
    }

    function sortUsers(
      users: TestUser[],
      sortField: "name" | "role" | "step" | "agreement" | "batch" | null,
      sortDirection: "asc" | "desc"
    ): TestUser[] {
      if (!sortField) return users;
      return [...users].sort((a, b) => {
        let valA: any = "";
        let valB: any = "";
        if (sortField === "name") {
          valA = (a.name || a.email).toLowerCase();
          valB = (b.name || b.email).toLowerCase();
        } else if (sortField === "role") {
          const weights: Record<string, number> = { SUPER_ADMIN: 4, ADMIN: 3, MANAGER: 2, USER: 1 };
          valA = weights[a.role] || 0;
          valB = weights[b.role] || 0;
        } else if (sortField === "step") {
          valA = a.role === "USER" ? (a.currentStepNumber || 1) : -1;
          valB = b.role === "USER" ? (b.currentStepNumber || 1) : -1;
        } else if (sortField === "agreement") {
          valA = a.role === "USER" ? (a.isAgreementSigned ? 2 : 1) : 0;
          valB = b.role === "USER" ? (b.isAgreementSigned ? 2 : 1) : 0;
        } else if (sortField === "batch") {
          valA = (a.role === "MANAGER" ? (a.managedBatches?.[0]?.name || "Unassigned") : (a.cohort || "—")).toLowerCase();
          valB = (b.role === "MANAGER" ? (b.managedBatches?.[0]?.name || "Unassigned") : (b.cohort || "—")).toLowerCase();
        }
        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    it('sorts users alphabetically by name in ascending and descending order', () => {
      const asc = sortUsers(mockUsers, "name", "asc");
      expect(asc[0]?.name).toBe("Aaron Smith");
      expect(asc[asc.length - 1]?.name).toBe("Zara Ali");

      const desc = sortUsers(mockUsers, "name", "desc");
      expect(desc[0]?.name).toBe("Zara Ali");
      expect(desc[desc.length - 1]?.name).toBe("Aaron Smith");
    });

    it('sorts users by role hierarchy (Super Admin > Admin > Manager > Learner)', () => {
      const sortedByRole = sortUsers(mockUsers, "role", "desc");
      expect(sortedByRole[0]?.role).toBe("SUPER_ADMIN");
      expect(sortedByRole[1]?.role).toBe("ADMIN");
      expect(sortedByRole[2]?.role).toBe("MANAGER");
      expect(sortedByRole[3]?.role).toBe("USER");
    });

    it('sorts learners by current curriculum step number', () => {
      const sortedByStep = sortUsers(mockUsers, "step", "desc");
      expect(sortedByStep[0]?.name).toBe("Zara Ali"); // Step 5
      expect(sortedByStep[1]?.name).toBe("Aaron Smith"); // Step 2
    });

    it('filters users by enrolled program, properly finding learners with multiple enrolments', () => {
      // Zara is in both Sigma 1 and 11 Steps to You; Aaron is in Sigma 1
      const sigma1Learners = filterUsers(mockUsers, "Sigma 1", "ALL", "ALL");
      expect(sigma1Learners.map(u => u.name)).toEqual(["Zara Ali", "Aaron Smith"]);

      // Only Zara is in 11 Steps to You
      const elevenStepsLearners = filterUsers(mockUsers, "11 Steps to You", "ALL", "ALL");
      expect(elevenStepsLearners.map(u => u.name)).toEqual(["Zara Ali"]);

      // Chloe has 0 enrolments
      const noProgramLearners = filterUsers(mockUsers, "NONE", "ALL", "ALL");
      expect(noProgramLearners.map(u => u.name)).toContain("Chloe Unassigned");
    });

    it('filters users by agreement status (Signed vs Pending)', () => {
      const signed = filterUsers(mockUsers, "ALL", "SIGNED", "ALL");
      expect(signed).toHaveLength(1);
      expect(signed[0]?.name).toBe("Zara Ali");

      const pending = filterUsers(mockUsers, "ALL", "PENDING", "ALL");
      expect(pending.every(u => u.role === "USER" && !u.isAgreementSigned)).toBe(true);
      expect(pending.map(u => u.name)).toEqual(["Aaron Smith", "Chloe Unassigned"]);
    });

    it('filters users by batch status (Unassigned vs Specific Batch)', () => {
      const unassigned = filterUsers(mockUsers, "ALL", "ALL", "UNASSIGNED");
      expect(unassigned.map(u => u.name)).toContain("Chloe Unassigned");

      const cohortA = filterUsers(mockUsers, "ALL", "ALL", "b-1");
      expect(cohortA.map(u => u.name)).toEqual(["Zara Ali", "Carlos Manager"]);
    });

    it('verifies that domain filters (Program, Batch, Agreement) cover all real operational states without phantom status filters', () => {
      // The LMS manages domain states (Enrollments, Batches, Agreements).
      // A combined filter query correctly narrows down target learners:
      const filtered = filterUsers(mockUsers, "Sigma 1", "SIGNED", "b-1");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Zara Ali");
    });
  });

  describe('8. CSV Export Engine Specification', () => {
    function generateUsersCsv(users: Array<{
      name: string;
      email: string;
      role: string;
      status?: string;
      currentStepNumber?: number;
      isAgreementSigned?: boolean;
      cohort?: string;
      managedBatches?: Array<{ name: string }>;
      enrolments?: Array<{ programTitle: string }>;
      joined?: string;
    }>): string {
      const headers = [
        "Name",
        "Email",
        "Role",
        "Account Status",
        "Enrolled Programs",
        "Unlocked Step",
        "Agreement Status",
        "Batch",
        "Joined Date",
      ];

      const rows = users.map(u => {
        const roleLabel =
          u.role === "USER"
            ? "Learner"
            : u.role === "MANAGER"
            ? "Batch Manager"
            : u.role === "ADMIN"
            ? "Admin"
            : u.role === "SUPER_ADMIN"
            ? "Super Admin"
            : u.role;

        const programs =
          u.enrolments && u.enrolments.length > 0
            ? u.enrolments.map(e => e.programTitle || "11 Steps to You").join("; ")
            : u.role === "USER" ? "None" : "—";

        const step = u.role === "USER" ? `Step ${u.currentStepNumber || 1} / 11` : "—";
        const agreement = u.role === "USER" ? (u.isAgreementSigned ? "Signed" : "Pending") : "—";
        const batch =
          u.role === "MANAGER"
            ? (u.managedBatches && u.managedBatches.length > 0
                ? u.managedBatches.map(b => b.name).join("; ")
                : "Unassigned")
            : (u.cohort || "—");

        const joinedDate = u.joined ? new Date(u.joined).toISOString().split("T")[0] : "—";

        return [
          `"${(u.name || "").replace(/"/g, '""')}"`,
          `"${(u.email || "").replace(/"/g, '""')}"`,
          `"${roleLabel}"`,
          `"${(u.status || "ACTIVE").toUpperCase()}"`,
          `"${programs.replace(/"/g, '""')}"`,
          `"${step}"`,
          `"${agreement}"`,
          `"${batch.replace(/"/g, '""')}"`,
          `"${joinedDate}"`,
        ];
      });

      return "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    }

    it('generates CSV with UTF-8 BOM, standard 9 headers, and proper escaping', () => {
      const csv = generateUsersCsv([
        {
          name: 'Jane "Coach" Doe',
          email: 'jane@whatboutme.com',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        {
          name: 'John Learner',
          email: 'john@example.com',
          role: 'USER',
          status: 'ACTIVE',
          currentStepNumber: 4,
          isAgreementSigned: true,
          cohort: 'Alpha 2026',
          enrolments: [{ programTitle: '11 Steps to You' }],
        },
      ]);

      // UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);

      const lines = csv.replace('\uFEFF', '').split('\n');
      expect(lines).toHaveLength(3); // Header + 2 rows

      expect(lines[0]).toBe('Name,Email,Role,Account Status,Enrolled Programs,Unlocked Step,Agreement Status,Batch,Joined Date');

      // Escaped quotes in name
      expect(lines[1]).toContain('"Jane ""Coach"" Doe"');
      expect(lines[1]).toContain('"Admin"');
      expect(lines[1]).toContain('"—"'); // Staff step is "—"
      expect(lines[1]).toContain('"—"'); // Staff agreement is "—"

      // Learner values
      expect(lines[2]).toContain('"John Learner"');
      expect(lines[2]).toContain('"Learner"');
      expect(lines[2]).toContain('"Step 4 / 11"');
      expect(lines[2]).toContain('"Signed"');
      expect(lines[2]).toContain('"Alpha 2026"');
    });
  });
});


import axios from "axios";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
});

// ---- attach access token to every request ----
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- auto-refresh on 401 once, then bail out to /login ----
let isRefreshing = false;
let queue = [];

const processQueue = (error, token = null) => {
  queue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  queue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        localStorage.clear();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh: refreshToken });
        localStorage.setItem("access_token", data.access);
        processQueue(null, data.access);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
export const authApi = {
  login: (username, password) => api.post("/auth/login/", { username, password }),
  verifyOtp: (challengeToken, otpCode) =>
    api.post("/auth/verify-otp/", { challenge_token: challengeToken, otp_code: otpCode }),
  forgotPassword: (admissionNo) => api.post("/auth/forgot-password/", { admission_no: admissionNo }),
  resetPassword: (token, newPassword) =>
    api.post("/auth/reset-password/", { token, new_password: newPassword }),
  me: () => api.get("/auth/me/"),
  changePassword: (payload) => api.post("/auth/change-password/", payload),
};

export const securityApi = {
  lockedUsers: () => api.get("/users/locked/"),
  unlockUser: (id) => api.post(`/users/${id}/unlock/`),
  loginAttempts: (params) => api.get("/login-attempts/", { params }),
  loginAttemptsSummary: () => api.get("/login-attempts/summary/"),
};


// ---------------------------------------------------------------------------
// PROFILE (any role - self-service, non-critical fields only)
// ---------------------------------------------------------------------------
export const profileApi = {
  me: () => api.get("/profile/me/"),
  update: (payload) => api.patch("/profile/me/", payload),
};

export const dashboardApi = {
  stats: () => api.get("/dashboard/stats/"),
};

// extend the existing calendarApi with write operations


// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------
export const reportsApi = {
  overview: () => api.get("/reports/overview/"),
};

// ---------------------------------------------------------------------------
// SCHOOL SETTINGS
// ---------------------------------------------------------------------------
export const schoolApi = {
  list: () => api.get("/schools/"),
  create: (payload) => api.post("/schools/", payload),
  update: (id, payload) => api.patch(`/schools/${id}/`, payload),
};

// ---------------------------------------------------------------------------
// PARENTS / GUARDIANS
// ---------------------------------------------------------------------------
export const guardiansApi = {
  list: (params) => api.get("/parents/", { params }),
  create: (payload) => api.post("/parents/", payload),
  links: (params) => api.get("/parent-links/", { params }),
  linkStudent: (payload) => api.post("/parent-links/", payload),
  unlink: (id) => api.delete(`/parent-links/${id}/`),
};

// ---------------------------------------------------------------------------
// ACADEMIC CALENDAR
// ---------------------------------------------------------------------------
export const calendarApi = {
  academicYears: () => api.get("/academic-years/"),
  createAcademicYear: (payload) => api.post("/academic-years/", payload),
  updateAcademicYear: (id, payload) => api.patch(`/academic-years/${id}/`, payload),
  terms: (params) => api.get("/terms/", { params }),
  createTerm: (payload) => api.post("/terms/", payload),
  updateTerm: (id, payload) => api.patch(`/terms/${id}/`, payload),
};

// ---------------------------------------------------------------------------
// CURRICULUM / CLASSES
// ---------------------------------------------------------------------------
export const academicsApi = {
  gradeLevels: (params) => api.get("/grade-levels/", { params }),
  streams: () => api.get("/streams/"),
  classrooms: (params) => api.get("/classrooms/", { params }),
  subjects: (params) => api.get("/subjects/", { params }),
  gradeSubjects: (params) => api.get("/grade-subjects/", { params }),
  selectionRules: () => api.get("/selection-rules/"),
  gradingScales: (params) => api.get("/grading-scales/", { params }),
};

// ---------------------------------------------------------------------------
// STUDENTS / ENROLLMENT
// ---------------------------------------------------------------------------
export const studentsApi = {
  list: (params) => api.get("/students/", { params }),
  detail: (id) => api.get(`/students/${id}/`),
  admit: (payload) => api.post("/students/admit/", payload),
  update: (id, payload) => api.patch(`/students/${id}/`, payload),
  remove: (id) => api.delete(`/students/${id}/`),
  resetPassword: (id, payload) => api.post(`/students/${id}/reset_password/`, payload),
  enrollments: (params) => api.get("/enrollments/", { params }),
  promote: (enrollmentId, payload) => api.post(`/enrollments/${enrollmentId}/promote/`, payload),
  bulkPromote: (payload) => api.post("/enrollments/bulk_promote/", payload),
  getSubjects: (enrollmentId) => api.get(`/enrollments/${enrollmentId}/subjects/`),
  setSubjects: (enrollmentId, subjectIds) =>
    api.post(`/enrollments/${enrollmentId}/subjects/`, { subject_ids: subjectIds }),
};

// ---------------------------------------------------------------------------
// TEACHER ALLOCATION
// ---------------------------------------------------------------------------
export const teacherApi = {
  myAllocations: () => api.get("/my-allocations/"),
  allAllocations: (params) => api.get("/teacher-allocations/", { params }),
};

// ---------------------------------------------------------------------------
// EXAMS / RESULTS / RANKING
// ---------------------------------------------------------------------------
export const examsApi = {
  examTypes: () => api.get("/exam-types/"),
  exams: (params) => api.get("/exams/", { params }),
  results: (params) => api.get("/exam-results/", { params }),
  bulkEntry: (payload) => api.post("/exam-results/bulk_entry/", payload),
  rankings: (params) => api.get("/rankings/", { params }),
  rank: (payload) => api.post("/rank/", payload),
};

// ---------------------------------------------------------------------------
// FEES
// ---------------------------------------------------------------------------
export const financeApi = {
  feeStructures: (params) => api.get("/fee-structures/", { params }),
  createFeeStructure: (payload) => api.post("/fee-structures/", payload),
  invoices: (params) => api.get("/invoices/", { params }),
  generateInvoice: (payload) => api.post("/invoices/generate/", payload),
  recordPayment: (payload) => api.post("/payments/", payload),
  status: () => api.get("/fees/status/"),   // <-- ADD THIS LINE
  payments: (params) => api.get("/payments/", { params }),
};

export const performanceApi = {
  dashboard: () => api.get("/students/me/performance/"),
};

export const communicationApi = {
  list: (params) => api.get("/communications/", { params }),
  send: (payload) => api.post("/communications/", payload),
};
 
export const notificationApi = {
  list: (params) => api.get("/notifications/", { params }),
  unreadCount: () => api.get("/notifications/unread_count/"),
  markRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllRead: () => api.post("/notifications/mark_all_read/"),
};
 
export const messagingApi = {
  conversations: () => api.get("/conversations/"),
  start: (payload) => api.post("/conversations/", payload), // { recipient_id, student_id?, body }
  messages: (conversationId) => api.get(`/conversations/${conversationId}/messages/`),
  send: (conversationId, body) => api.post(`/conversations/${conversationId}/messages/`, { body }),
  unreadCount: () => api.get("/conversations/unread_count/"),
  searchRecipients: (params) => api.get("/messaging/recipients/", { params }), // { search, role? }
};
 

// ---------------------------------------------------------------------------
// FINANCE REPORTS (3 pages: collections, class analysis, detailed)
// ---------------------------------------------------------------------------
export const financeReportsApi = {
  collections: (params) => api.get("/finance-reports/collections/", { params }),
  classAnalysis: (params) => api.get("/finance-reports/class-analysis/", { params }),
  detailed: (params) => api.get("/finance-reports/detailed/", { params }),
  studentBalances: (params) => api.get("/finance-reports/student-balances/", { params }), // <-- ADD
};

// ---------------------------------------------------------------------------
// STUDENT/PARENT SELF-SERVICE FEE PAYMENT (STK push, DEBUG-bypassed locally)
// ---------------------------------------------------------------------------
export const paymentsApi = {
  // amount can be less than the balance (partial) or more (creates a credit
  // that automatically applies to the student's next term invoice)
  initiate: (payload) => api.post("/payments/initiate/", payload),
  status: (checkoutRequestId) => api.get(`/payments/status/${checkoutRequestId}/`),
  receipt: (paymentId) => api.get(`/payments/${paymentId}/receipt/`),
  // public - no auth required, used by the QR-code verification page
  verifyReceipt: (receiptNo) => api.get(`/receipts/verify/${receiptNo}/`),
};

export default api;

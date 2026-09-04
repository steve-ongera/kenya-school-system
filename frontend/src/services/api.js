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
  me: () => api.get("/auth/me/"),
  changePassword: (payload) => api.post("/auth/change-password/", payload),
};

export const dashboardApi = {
  stats: () => api.get("/dashboard/stats/"),
};

// ---------------------------------------------------------------------------
// ACADEMIC CALENDAR
// ---------------------------------------------------------------------------
export const calendarApi = {
  academicYears: () => api.get("/academic-years/"),
  terms: (params) => api.get("/terms/", { params }),
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
};

// ---------------------------------------------------------------------------
// STUDENTS / ENROLLMENT
// ---------------------------------------------------------------------------
export const studentsApi = {
  list: (params) => api.get("/students/", { params }),
  detail: (id) => api.get(`/students/${id}/`),
  admit: (payload) => api.post("/students/admit/", payload),
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
};

export default api;

import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Breadcrumb from "../../components/Breadcrumb";
import logoImage from "../../assets/junda_high_logo.png";

/* ==========================================================================
   LETTERS & DOCUMENTS  (admin)
   Ready-made letter templates. Nothing is fetched from the database: the
   admin picks a template, fills in the blanks, then prints it or downloads
   a PDF. The school letterhead is set once and remembered on this device.

   TEMPLATE SYNTAX (used in every `body` below, and in the "Edit wording" box)
     {{key}}            a fill-in field (see the F table for the field list)
     blank line         starts a new paragraph
     # Heading          a small section heading
     - item             a bullet point
     | Label | Value |  a row in a details table
   ========================================================================== */

const LH_KEY = "masomo_letterhead_v1";
const thisYear = String(new Date().getFullYear());
const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_LH = {
  schoolName: "Junda High School Shanzu",
  schoolAddress: "",
  schoolPhone: "",
  schoolEmail: "",
  schoolMotto: "",
  principalName: "",
  showLogo: true,
};

const LH_KEYS = ["schoolName", "schoolAddress", "schoolPhone", "schoolEmail", "schoolMotto", "principalName"];
const SPECIAL_KEYS = new Set([...LH_KEYS, "signerName", "signerTitle", "letterDate", "refNo"]);

const LH_LABELS = {
  schoolName: "School name",
  schoolAddress: "School address",
  schoolPhone: "School phone",
  schoolEmail: "School email",
  schoolMotto: "School motto",
  principalName: "Principal's name",
  signerName: "Signatory name",
  signerTitle: "Signatory title",
};

/* --------------------------------------------------------------------------
   FIELD LIBRARY - label, input type, default value and hint for every {{key}}
   -------------------------------------------------------------------------- */
const F = {
  letterDate: { label: "Letter date", type: "date" },
  refNo: { label: "Reference no. (optional)", ph: "e.g. JHS/ADM/2027/014" },

  // student
  studentName: { label: "Student full name", ph: "e.g. Brian Otieno Odhiambo" },
  admissionNo: { label: "Admission number", ph: "e.g. ADM00123" },
  className: { label: "Class / Form", ph: "e.g. Form 2 Blue" },
  academicYear: { label: "Academic year", def: thisYear },
  term: { label: "Term", type: "select", options: ["Term 1", "Term 2", "Term 3"], def: "Term 1" },

  // admissions
  reportingDate: { label: "Reporting date", type: "date" },
  reportingTime: { label: "Reporting time", def: "8:00 a.m." },
  feeAmount: { label: "Term fees payable (KES)", type: "money", ph: "e.g. 53000" },
  paymentDetails: {
    label: "Payment details",
    type: "textarea",
    ph: "e.g. Pay via M-Pesa Paybill 123456, Account: admission number, or by bank deposit to ...",
  },
  previousSchool: { label: "Previous school" },
  absenceReason: { label: "Reason for earlier absence", def: "a period away from school", ph: "e.g. medical deferment" },

  // academic
  admittedYear: { label: "Year admitted", ph: "e.g. 2024" },
  completionYear: { label: "Year of completion / current", def: thisYear },
  qualities: {
    label: "Student's qualities",
    type: "textarea",
    def: "diligent, disciplined and respectful, with a genuine commitment to learning and a positive influence on peers",
  },
  recPurpose: { label: "Recommended for", def: "their future studies or career opportunities" },
  purpose: { label: "Purpose of letter", def: "official purposes", ph: "e.g. a bursary application" },
  conduct: { label: "General conduct", type: "select", options: ["Excellent", "Very Good", "Good", "Satisfactory"], def: "Good" },
  disciplineRecord: {
    label: "Discipline record",
    type: "textarea",
    def: "The school has no record of any serious disciplinary offence against the student.",
  },
  dateAdmitted: { label: "Date admitted", type: "date" },
  dateLeft: { label: "Date of leaving", type: "date" },
  lastClass: { label: "Last class attended", ph: "e.g. Form 4 Red" },
  leavingReason: { label: "Reason for leaving", def: "completed the secondary school course" },
  kcseIndex: { label: "KCSE index no. (if any)", def: "N/A" },
  meanScore: { label: "Mean score (%)", ph: "e.g. 68.4" },
  meanGrade: { label: "Mean grade", ph: "e.g. B" },
  classPosition: { label: "Class position", ph: "e.g. 5 out of 42" },
  remarks: {
    label: "Class teacher's remarks",
    type: "textarea",
    def: "The student is encouraged to remain focused and to keep working steadily towards improved results.",
  },
  examName: { label: "Examination", def: "KCSE" },
  examYear: { label: "Examination year", def: thisYear },
  indexNumber: { label: "Index number" },
  centreCode: { label: "Examination centre code" },
  examStartDate: { label: "Expected start date", type: "date" },

  // fees
  totalFees: { label: "Total fees for term (KES)", type: "money" },
  amountPaid: { label: "Amount paid (KES)", type: "money" },
  balance: { label: "Balance (KES)", type: "money" },
  deadline: { label: "Payment deadline", type: "date" },
  receiptNo: { label: "Receipt number", ph: "e.g. RCT-2027-00045" },
  paymentDate: { label: "Payment date", type: "date" },
  paymentMode: { label: "Payment mode", type: "select", options: ["M-Pesa", "Bank deposit", "Cash", "Cheque"], def: "M-Pesa" },
  damagedItem: { label: "Item damaged / lost", ph: "e.g. laboratory glassware" },
  incidentDate: { label: "Date of incident", type: "date" },
  chargeAmount: { label: "Amount to be paid (KES)", type: "money" },

  // meetings & absence
  meetingDate: { label: "Meeting date", type: "date" },
  meetingTime: { label: "Meeting time", def: "10:00 a.m." },
  meetingVenue: { label: "Venue", def: "Principal's Office" },
  meetingAgenda: { label: "Agenda", type: "textarea", def: "The student's academic progress and general welfare." },
  absentFrom: { label: "Absent since", type: "date" },
  daysAbsent: { label: "Days absent", ph: "e.g. 5" },
  returnDate: { label: "Expected return date", type: "date" },

  // consent, sports & trips
  activity: { label: "Activity", ph: "e.g. Career day at the county showground" },
  activityDate: { label: "Date", type: "date" },
  activityVenue: { label: "Venue" },
  departureTime: { label: "Departure time", def: "7:00 a.m." },
  returnTime: { label: "Return time", def: "5:00 p.m." },
  activityCost: { label: "Cost per student (KES)", type: "money", ph: "0 if free" },
  consentDeadline: { label: "Return slip by", type: "date" },
  teacherInCharge: { label: "Teacher in charge" },
  sport: { label: "Sport / game", ph: "e.g. Football" },
  eventName: { label: "Event", ph: "e.g. County Secondary Schools Games" },
  teamName: { label: "Team", def: "the school team" },
  trainingSchedule: {
    label: "Training schedule",
    type: "textarea",
    def: "Training sessions will be held after classes and on weekends as communicated by the games department.",
  },
  injuryDate: { label: "Date of injury", type: "date" },
  injuryDescription: { label: "Nature of injury", type: "textarea" },
  firstAidGiven: {
    label: "First aid given",
    type: "textarea",
    def: "First aid was administered immediately by the games teacher and the school nurse.",
  },
  currentLocation: { label: "Current location", def: "School sickbay" },
  destination: { label: "Destination" },
  tripPurpose: { label: "Purpose of trip", ph: "e.g. Geography field study" },
  achievement: { label: "Achievement", type: "textarea", ph: "e.g. Top position in the county mathematics contest" },
  achievementDate: { label: "Date of achievement", type: "date" },
  commendationNote: {
    label: "Closing note",
    type: "textarea",
    def: "The school is proud of the student and encourages continued excellence.",
  },

  // health
  symptoms: { label: "Illness / symptoms", ph: "e.g. fever and headache" },
  illness: { label: "Illness / condition" },
  dateFell: { label: "Date taken ill", type: "date" },
  treatmentGiven: {
    label: "Treatment given",
    type: "textarea",
    def: "The student was attended to by the school nurse and is receiving appropriate care.",
  },
  parentRequest: {
    label: "Message to parent",
    type: "textarea",
    def: "We will keep you updated on the student's condition. You are welcome to visit or call the school for any information.",
  },
  sickFrom: { label: "Sick leave starts", type: "date" },
  medicalNote: {
    label: "Medical note requirement",
    type: "textarea",
    def: "The student is to present a medical note from the attending doctor upon return to school.",
  },
  hospitalName: { label: "Hospital / clinic" },
  escortName: { label: "Accompanied by", ph: "e.g. Nurse Jane Achieng" },
  schoolTreatment: {
    label: "Treatment given at school",
    type: "textarea",
    def: "First aid and initial care were given by the school nurse.",
  },

  // discipline & transfers
  incidentDescription: { label: "Nature of incident", type: "textarea" },
  actionTaken: {
    label: "Action taken",
    type: "textarea",
    def: "The student has been counselled and issued with a formal warning.",
  },
  offence: { label: "Reason / offence", type: "textarea" },
  suspensionFrom: { label: "Suspension starts", type: "date" },
  conditions: {
    label: "Conditions for return",
    type: "textarea",
    def: "The student must report back accompanied by a parent/guardian for a meeting with the Principal before resuming classes.",
  },
  effectiveDate: { label: "Effective date", type: "date" },
  decisionBody: { label: "Decision made by", def: "the Board of Management" },
  appealDetails: {
    label: "Appeal details",
    type: "textarea",
    def: "Should you wish to appeal this decision, kindly submit a written appeal to the Chairperson of the Board of Management within the period allowed under the school's discipline policy.",
  },
  receivingSchool: { label: "Receiving school" },
  transferReason: { label: "Reason for transfer", def: "at the request of the parent/guardian" },
  clearanceStatus: {
    label: "Clearance statement",
    type: "textarea",
    def: "The student has cleared with the school and has no outstanding obligations.",
  },

  // staff
  staffName: { label: "Staff member's name" },
  position: { label: "Position", ph: "e.g. Teacher of Mathematics" },
  department: { label: "Department", ph: "e.g. Sciences" },
  startDate: { label: "Effective / start date", type: "date" },
  contractType: { label: "Terms of service", type: "select", options: ["Permanent", "Fixed-term contract", "Probationary"], def: "Permanent" },
  probationPeriod: { label: "Probation period", def: "three (3) months" },
  grossSalary: { label: "Gross monthly salary (KES)", type: "money" },
  reportsTo: { label: "Reports to", def: "The Principal" },
  acceptanceDeadline: { label: "Accept by", type: "date" },
  dateJoined: { label: "Date joined", type: "date" },
  confirmationDate: { label: "Confirmation effective", type: "date" },
  performanceNote: {
    label: "Performance note",
    type: "textarea",
    def: "Your performance and conduct during the probation period have been satisfactory.",
  },
  issue: { label: "Nature of concern", type: "textarea" },
  previousWarning: { label: "Warning status", def: "This is a first written warning." },
  expectedImprovement: {
    label: "Improvement required",
    type: "textarea",
    def: "You are required to correct this conduct immediately and to comply with the school's policies and instructions.",
  },
  reviewDate: { label: "Review date", type: "date" },
  leaveType: {
    label: "Type of leave",
    type: "select",
    options: ["Annual leave", "Sick leave", "Maternity leave", "Paternity leave", "Compassionate leave", "Study leave", "Unpaid leave"],
    def: "Annual leave",
  },
  leaveFrom: { label: "Leave starts", type: "date" },
  leaveTo: { label: "Leave ends", type: "date" },
  resumeDate: { label: "Resumes duty on", type: "date" },
  relievingArrangement: {
    label: "Cover arrangement",
    type: "textarea",
    def: "Your duties will be covered by colleagues as arranged with your head of department.",
  },
  traineeName: { label: "Trainee / attachee name" },
  institution: { label: "College / university" },
  courseName: { label: "Course / programme" },
  attachFrom: { label: "Attachment from", type: "date" },
  attachTo: { label: "Attachment to", type: "date" },
  attachDept: { label: "Department attached to", ph: "e.g. Humanities" },
  duties: {
    label: "Duties performed",
    type: "textarea",
    def: "lesson preparation and delivery, marking, and participation in co-curricular activities",
  },
  performance: { label: "Performance", type: "select", options: ["Excellent", "Very Good", "Good", "Satisfactory"], def: "Good" },
};

/* --------------------------------------------------------------------------
   CATEGORIES
   -------------------------------------------------------------------------- */
const CATEGORIES = [
  { id: "admissions", label: "Admissions", icon: "bi-mortarboard" },
  { id: "academic", label: "Academic & Records", icon: "bi-journal-text" },
  { id: "parents", label: "Parents & Fees", icon: "bi-people" },
  { id: "health", label: "Health & Welfare", icon: "bi-heart-pulse" },
  { id: "sports", label: "Sports & Trips", icon: "bi-trophy" },
  { id: "discipline", label: "Discipline & Transfers", icon: "bi-shield-exclamation" },
  { id: "staff", label: "Staff & HR", icon: "bi-briefcase" },
];

/* --------------------------------------------------------------------------
   TEMPLATES
   -------------------------------------------------------------------------- */
const T = (o) => ({
  salutation: "Dear Parent/Guardian,",
  closing: "Yours faithfully,",
  signerTitle: "Principal",
  ...o,
});
const WHOM = "To Whom It May Concern,";
const CONSENT_SLIP_LINE =
  "Signature: ______________________     Date: ________________     Phone: ________________";

const TEMPLATES = [
  /* ------------------------------ ADMISSIONS ------------------------------ */
  T({
    id: "admission",
    cat: "admissions",
    title: "Admission Letter",
    desc: "Confirms a student has been admitted, with reporting details.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "LETTER OF ADMISSION – {{studentName}}, {{className}}",
    body: `We are pleased to inform you that {{studentName}} has been admitted to {{schoolName}} to join {{className}} for the {{academicYear}} academic year.

| Student Name | {{studentName}} |
| Admission No. | {{admissionNo}} |
| Class | {{className}} |
| Academic Year | {{academicYear}} |
| Reporting Date | {{reportingDate}}, from {{reportingTime}} |

The student is expected to report on the date above, accompanied by a parent or guardian. Please read the accompanying joining instructions carefully, as they outline the fees payable and the items required.

On reporting, please carry the following documents:
- This admission letter
- Birth certificate (original and a photocopy)
- Previous school report forms and leaving or transfer certificate, where applicable
- Two recent passport-size photographs
- Medical report and immunisation records

We warmly welcome {{studentName}} to the {{schoolName}} family and look forward to working closely with you to support the student's academic and personal growth.`,
  }),

  T({
    id: "joining",
    cat: "admissions",
    title: "Joining Instructions",
    desc: "Reporting date, fees, uniform and items to bring.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "JOINING INSTRUCTIONS – {{term}}, {{academicYear}}",
    body: `Reference is made to the admission of {{studentName}} (Adm. No. {{admissionNo}}) to {{className}}. Please note the following joining instructions.

# Reporting details
| Term | {{term}}, {{academicYear}} |
| Reporting Date | {{reportingDate}} |
| Reporting Time | {{reportingTime}} |

# Fees
The fees payable for the term are KES {{feeAmount}}. {{paymentDetails}} Please carry the bank slip or M-Pesa confirmation on reporting day. Parents facing difficulty may see the Principal for guidance on payment arrangements.

# Required items
- School uniform as specified in the school regulations, including sweater and games kit
- Bedding: two bed sheets, blankets and a mosquito net (boarding students)
- A lockable trunk or suitcase and a padlock
- Stationery: exercise books, pens, pencils, a mathematical set and a scientific calculator
- Toiletries, a bucket and personal cleaning materials
- Prescribed textbooks and set books, where applicable

# General notes
- Students must report in full school uniform.
- Mobile phones, electronic gadgets and other items prohibited by the school are not allowed.
- The student must be accompanied by a parent or guardian on reporting day.`,
  }),

  T({
    id: "transfer-accept",
    cat: "admissions",
    title: "Transfer Admission Acceptance",
    desc: "Accepts a student transferring in from another school.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "ACCEPTANCE OF TRANSFER – {{studentName}}",
    body: `We acknowledge your request for the transfer of {{studentName}} from {{previousSchool}} to {{schoolName}}.

We are pleased to confirm that the student has been accepted into {{className}} for the {{academicYear}} academic year, subject to the availability of space and verification of the documents listed below.

| Student Name | {{studentName}} |
| Admission No. | {{admissionNo}} |
| Previous School | {{previousSchool}} |
| Class Admitted To | {{className}} |
| Reporting Date | {{reportingDate}} |

Please present the following on reporting:
- An official transfer or release letter from the previous school
- The most recent report form and any outstanding assessment records
- Original birth certificate and a photocopy
- The national assessment results slip or previous school leaving certificate
- Two passport-size photographs

We look forward to welcoming {{studentName}} and wish the student a smooth transition and a successful stay at {{schoolName}}.`,
  }),

  T({
    id: "readmission",
    cat: "admissions",
    title: "Re-admission Letter",
    desc: "For a student returning after leaving or deferring.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "RE-ADMISSION – {{studentName}}",
    body: `Further to your request, we are pleased to inform you that {{studentName}} (Adm. No. {{admissionNo}}) has been re-admitted to {{schoolName}} following {{absenceReason}}.

| Student Name | {{studentName}} |
| Admission No. | {{admissionNo}} |
| Class | {{className}} |
| Term | {{term}}, {{academicYear}} |
| Reporting Date | {{reportingDate}} |

This re-admission is subject to the following conditions:
- Any outstanding fees are cleared, or a payment arrangement is agreed with the Finance Office before reporting
- The student and parent/guardian familiarise themselves with, and commit to observe, the school rules and regulations
- A medical report is presented where the absence was on health grounds

We wish {{studentName}} a fresh and successful start and assure you of the school's support.`,
  }),

  /* ------------------------------- ACADEMIC ------------------------------- */
  T({
    id: "recommendation",
    cat: "academic",
    title: "Recommendation Letter",
    desc: "The school recommends a student for studies or opportunities.",
    salutation: WHOM,
    subject: "RECOMMENDATION – {{studentName}}",
    body: `I write to recommend {{studentName}} (Adm. No. {{admissionNo}}), who has been a student at {{schoolName}} from {{admittedYear}} to {{completionYear}}, most recently in {{className}}.

During this time, the student has been {{qualities}}. The student has taken part responsibly in school life and has kept good relationships with teachers and fellow students.

This recommendation is given in support of {{recPurpose}}. I am confident that {{studentName}} will make a valuable contribution and I recommend the student without reservation.

Should you require any further information, please contact the school on {{schoolPhone}} or {{schoolEmail}}.`,
  }),

  T({
    id: "character",
    cat: "academic",
    title: "Character Reference Letter",
    desc: "Confirms a student's conduct and character.",
    salutation: WHOM,
    subject: "CHARACTER REFERENCE – {{studentName}}",
    body: `This is to certify that {{studentName}} (Adm. No. {{admissionNo}}) has been a student of {{schoolName}} since {{admittedYear}} and is currently in {{className}}.

Based on our records and observations, the student's general conduct has been rated as {{conduct}}. {{disciplineRecord}} The student has shown respect for school authority, staff and fellow students.

This letter is issued at the request of the student's parent/guardian for {{purpose}}, and is given in good faith without any liability on the part of the school.`,
  }),

  T({
    id: "leaving",
    cat: "academic",
    title: "School Leaving / Completion Letter",
    desc: "Confirms a student completed or left the school.",
    salutation: WHOM,
    subject: "SCHOOL LEAVING LETTER – {{studentName}}",
    body: `This is to certify that the person named below was a student at {{schoolName}}.

| Student Name | {{studentName}} |
| Admission No. | {{admissionNo}} |
| Date Admitted | {{dateAdmitted}} |
| Date of Leaving | {{dateLeft}} |
| Last Class Attended | {{lastClass}} |
| KCSE Index No. | {{kcseIndex}} |
| General Conduct | {{conduct}} |

The student left the school having {{leavingReason}}.

This letter is issued on request and does not replace the official certificate or results slip issued by the Kenya National Examinations Council (KNEC).`,
  }),

  T({
    id: "progress",
    cat: "academic",
    title: "Academic Progress Letter",
    desc: "Shares a student's term performance with parents.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "ACADEMIC PROGRESS – {{term}}, {{academicYear}}",
    body: `We write to share the academic progress of {{studentName}} for {{term}}, {{academicYear}}.

| Student Name | {{studentName}} |
| Admission No. | {{admissionNo}} |
| Class | {{className}} |
| Mean Score | {{meanScore}}% |
| Mean Grade | {{meanGrade}} |
| Class Position | {{classPosition}} |

Class teacher's remarks: {{remarks}}

We encourage you to review the full report form with the student and to support regular revision at home. Should you wish to discuss the results, kindly book an appointment with the class teacher through the school office.`,
  }),

  T({
    id: "exam-reg",
    cat: "academic",
    title: "Exam Registration Confirmation",
    desc: "Confirms a candidate is registered for an examination.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "CONFIRMATION OF EXAMINATION REGISTRATION – {{examName}} {{examYear}}",
    body: `This is to confirm that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} has been registered by {{schoolName}} to sit the {{examName}} examination in {{examYear}}.

| Candidate Name | {{studentName}} |
| Index Number | {{indexNumber}} |
| Examination | {{examName}} {{examYear}} |
| Centre Code | {{centreCode}} |
| Expected Start Date | {{examStartDate}} |

Candidates are reminded to:
- Carry the school ID and the required identification documents on every examination day
- Observe all examination rules and regulations issued by the examining body and the school
- Report to the examination room at least 30 minutes before each paper

Parents/guardians are requested to ensure that all fees and examination-related obligations are cleared, and to support the candidate through this important period.`,
  }),

  T({
    id: "studentship",
    cat: "academic",
    title: "Confirmation of Student Status",
    desc: "Proves a student is enrolled, for banks, bursaries or visas.",
    salutation: WHOM,
    subject: "CONFIRMATION OF STUDENT STATUS – {{studentName}}",
    body: `This is to confirm that {{studentName}}, Admission No. {{admissionNo}}, is a bona fide student of {{schoolName}}, currently enrolled in {{className}} for the {{academicYear}} academic year ({{term}}).

This letter has been issued at the request of the student's parent/guardian for {{purpose}}. It is issued without any liability on the part of the school.`,
  }),

  /* ----------------------------- PARENTS & FEES ---------------------------- */
  T({
    id: "fee-reminder",
    cat: "parents",
    title: "Fee Reminder Letter",
    desc: "A friendly reminder about an unpaid fee balance.",
    signerTitle: "Bursar / Finance Officer",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "FEE BALANCE REMINDER – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `This is a friendly reminder regarding the school fees for {{studentName}} of {{className}} for {{term}}, {{academicYear}}.

| Total Fees | KES {{totalFees}} |
| Amount Paid | KES {{amountPaid}} |
| Balance Due | KES {{balance}} |

We kindly request that the balance be settled by {{deadline}}. {{paymentDetails}}

If you have already made this payment, please disregard this reminder and share the payment confirmation with the Finance Office so that our records can be updated. If you are facing difficulty, please contact the Finance Office to discuss a suitable payment arrangement.

Thank you for your continued support and partnership.`,
  }),

  T({
    id: "fee-arrears",
    cat: "parents",
    title: "Fee Arrears / Demand Letter",
    desc: "A firm notice for overdue fees, with a payment deadline.",
    signerTitle: "Bursar / Finance Officer",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "NOTICE OF FEE ARREARS – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `We write regarding outstanding school fees for {{studentName}} of {{className}}. Despite earlier reminders, our records show an unpaid balance of KES {{balance}} as at the date of this letter.

You are requested to clear this balance in full by {{deadline}}. {{paymentDetails}}

Please treat this matter with urgency. Unpaid fees affect the school's ability to provide learning materials and to run essential services for all students.

If you are experiencing financial difficulty, kindly see the Principal or the Finance Office before the deadline to agree on a payment plan or to be guided on available bursary options.

If payment has already been made, please present proof of payment to the Finance Office.`,
  }),

  T({
    id: "fee-confirmation",
    cat: "parents",
    title: "Fee Payment Confirmation",
    desc: "Confirms that a fee payment has been received.",
    signerTitle: "Bursar / Finance Officer",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "CONFIRMATION OF FEE PAYMENT – {{studentName}}",
    body: `This letter confirms that the school has received the payment described below in respect of {{studentName}}.

| Student Name | {{studentName}} |
| Admission No. | {{admissionNo}} |
| Class | {{className}} |
| Term | {{term}}, {{academicYear}} |
| Amount Received | KES {{amountPaid}} |
| Payment Date | {{paymentDate}} |
| Payment Mode | {{paymentMode}} |
| Receipt No. | {{receiptNo}} |
| Balance After Payment | KES {{balance}} |

Thank you for your prompt payment. This letter is a confirmation only; the official receipt remains the primary proof of payment. Kindly keep both for your records.`,
  }),

  T({
    id: "meeting",
    cat: "parents",
    title: "Parent Meeting Invitation",
    desc: "Invites a parent or guardian to meet the school.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "INVITATION TO A PARENTS' MEETING",
    body: `You are kindly invited to a meeting concerning {{studentName}} (Adm. No. {{admissionNo}}) of {{className}}, as detailed below.

| Date | {{meetingDate}} |
| Time | {{meetingTime}} |
| Venue | {{meetingVenue}} |
| Agenda | {{meetingAgenda}} |

Your attendance is important, as it allows us to work together in the best interest of the student. If you are unable to attend on the stated date, please contact the school office in advance so that another time can be arranged.

Kindly acknowledge receipt of this invitation by signing the slip below and returning it through the student.

# Acknowledgement slip
I, ______________________________, parent/guardian of {{studentName}}, acknowledge receipt of this invitation.

Signature: ______________________     Date: ________________`,
  }),

  T({
    id: "absence",
    cat: "parents",
    title: "Student Absence / Attendance Notice",
    desc: "Asks a parent to explain an unexplained absence.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "NOTICE OF STUDENT ABSENCE – {{studentName}}",
    body: `Our attendance records show that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} has been absent from school since {{absentFrom}}, a total of {{daysAbsent}} school day(s), and the school has not received any communication explaining the absence.

Regular attendance is essential to the student's progress. We kindly request that you contact the school office or the class teacher as soon as possible to explain the reason for the absence, and ensure that the student resumes classes by {{returnDate}}.

Where the absence is due to illness, please present a medical note upon the student's return. If the student is facing difficulties that we should be aware of, we are ready to assist.`,
  }),

  T({
    id: "consent",
    cat: "parents",
    title: "Consent / Permission Letter",
    desc: "General parental consent for a school activity, with a slip.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "REQUEST FOR PARENTAL CONSENT – {{activity}}",
    body: `The school is organising the activity below, in which {{studentName}} of {{className}} is expected to participate. Your written consent is required before the student may take part.

| Activity | {{activity}} |
| Date | {{activityDate}} |
| Venue | {{activityVenue}} |
| Departure / Return | {{departureTime}} / {{returnTime}} |
| Cost | KES {{activityCost}} |
| Teacher in Charge | {{teacherInCharge}} |

The student will be under the supervision of school staff throughout the activity and is expected to observe the school rules at all times. Please return the consent slip below by {{consentDeadline}}.

# Consent slip
I, ______________________________, parent/guardian of {{studentName}} (Adm. No. {{admissionNo}}), give consent for the student to participate in the activity described above. I confirm that the student is in good health to take part.

${CONSENT_SLIP_LINE}`,
  }),

  T({
    id: "breakages",
    cat: "parents",
    title: "Damage / Loss of Property Notice",
    desc: "Notifies a parent of a charge for damaged school property.",
    signerTitle: "Bursar / Finance Officer",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "NOTICE OF DAMAGED OR LOST SCHOOL PROPERTY – {{studentName}}",
    body: `We write to inform you that on {{incidentDate}}, {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} was involved in the damage or loss of school property, as described below.

| Item | {{damagedItem}} |
| Date of Incident | {{incidentDate}} |
| Amount to be Paid | KES {{chargeAmount}} |

In line with school regulations, the cost of repair or replacement is to be met by the parent/guardian. Kindly settle the amount by {{deadline}}. {{paymentDetails}}

If you would like to discuss the circumstances of the incident, please contact the school office. We appreciate your cooperation.`,
  }),

  /* ---------------------------- HEALTH & WELFARE --------------------------- */
  T({
    id: "sick-notice",
    cat: "health",
    title: "Sick Notification to Parent",
    desc: "Tells a parent their child has fallen ill at school.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "STUDENT ILLNESS NOTIFICATION – {{studentName}}",
    body: `We regret to inform you that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} fell ill on {{dateFell}} with {{symptoms}}.

{{treatmentGiven}}

{{parentRequest}}

Please reach the school on {{schoolPhone}} for any further information. We wish the student a quick recovery.`,
  }),

  T({
    id: "sick-leave",
    cat: "health",
    title: "Sick Leave / Medical Exeat",
    desc: "Authorises a sick student to go home for treatment.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "SICK LEAVE / MEDICAL EXEAT – {{studentName}}",
    body: `This letter authorises {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} to proceed on sick leave with effect from {{sickFrom}} on account of {{symptoms}}.

The student is expected to resume school on {{returnDate}}, subject to recovery. {{medicalNote}}

The student is to be released to a parent/guardian only. Assignments to be covered during the absence may be obtained from the class teacher. This letter serves as the student's exeat and should be presented at the gate on departure.`,
  }),

  T({
    id: "hospital-referral",
    cat: "health",
    title: "Hospital Referral Letter",
    desc: "Refers a student to a hospital or clinic.",
    salutation: "Dear Doctor,",
    to: "The Medical Officer in Charge\n{{hospitalName}}",
    subject: "MEDICAL REFERRAL – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `We refer {{studentName}}, a student of {{className}} at {{schoolName}}, for examination and treatment.

| Presenting Complaint | {{symptoms}} |
| Date Taken Ill | {{dateFell}} |
| Treatment Given at School | {{schoolTreatment}} |
| Accompanied By | {{escortName}} |

Kindly examine the student and provide the necessary treatment. We would appreciate a brief medical report, including any recommended rest period, so that the school can support the student's recovery. Treatment costs will be handled through the student's parent/guardian or medical cover, as applicable.

Thank you for your assistance.`,
  }),

  T({
    id: "medical-clearance",
    cat: "health",
    title: "Medical Clearance Request",
    desc: "Asks for a doctor's fitness report before a student returns.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "REQUEST FOR MEDICAL CLEARANCE – {{studentName}}",
    body: `We were sorry to learn that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} has been unwell with {{illness}}, and we hope the student is recovering well.

Before the student resumes classes on {{returnDate}}, and before taking part in games or physical activity, we kindly request a medical report or fitness certificate from the attending doctor confirming:
- The nature of the illness and the treatment given
- That the student is fit to resume studies and school activities
- Any restrictions, medication or special care the school should be aware of

Please present the report to the school nurse or class teacher on the day the student returns. Thank you for your cooperation.`,
  }),

  /* ----------------------------- SPORTS & TRIPS ---------------------------- */
  T({
    id: "sports-consent",
    cat: "sports",
    title: "Sports Participation Consent",
    desc: "Selects a student for a match or tournament and seeks consent.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "SPORTS PARTICIPATION – {{eventName}}",
    body: `We are pleased to inform you that {{studentName}} of {{className}} has been selected to represent {{schoolName}} in {{sport}} at the event below.

| Event | {{eventName}} |
| Sport | {{sport}} |
| Date | {{activityDate}} |
| Venue | {{activityVenue}} |
| Departure / Return | {{departureTime}} / {{returnTime}} |
| Teacher in Charge | {{teacherInCharge}} |
| Cost per Student | KES {{activityCost}} |

Participation is subject to your written consent and to the student being medically fit. Students will travel and remain under the supervision of the games teachers throughout, must wear the official school sports kit, and are expected to show good sportsmanship and observe school rules.

Please sign and return the slip below by {{consentDeadline}}.

# Parent/guardian consent
I, ______________________________, parent/guardian of {{studentName}} (Adm. No. {{admissionNo}}), consent to the student's participation in {{sport}} at {{eventName}}. I confirm that the student is medically fit to take part and authorise the school to seek emergency medical treatment should the need arise.

${CONSENT_SLIP_LINE}`,
  }),

  T({
    id: "team-selection",
    cat: "sports",
    title: "Sports Team Selection Notice",
    desc: "Congratulates a student on making a school team.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "SELECTION TO REPRESENT THE SCHOOL – {{sport}}",
    body: `Congratulations! We are delighted to inform you that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} has been selected for {{teamName}} in {{sport}}, to represent {{schoolName}} at {{eventName}}.

This achievement reflects the student's talent, discipline and hard work.

{{trainingSchedule}} The teacher in charge is {{teacherInCharge}}.

We kindly ask for your support by:
- Ensuring the student attends training and matches punctually
- Providing the required sports kit and personal items
- Helping the student to balance academic work with sport

Please note that participation in school teams is a privilege that depends on good conduct and continued academic effort. We thank you for supporting the student's talent.`,
  }),

  T({
    id: "sports-injury",
    cat: "sports",
    title: "Sports Injury Notification",
    desc: "Informs a parent about an injury during sport.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "NOTIFICATION OF SPORTS INJURY – {{studentName}}",
    body: `We regret to inform you that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} sustained an injury during {{sport}} on {{injuryDate}}.

| Nature of Injury | {{injuryDescription}} |
| First Aid Given | {{firstAidGiven}} |
| Current Location | {{currentLocation}} |

The teacher in charge, {{teacherInCharge}}, attended to the student promptly, and the school will continue to monitor the student's condition. We recommend a medical review, and you are welcome to contact the school on {{schoolPhone}} to discuss further care or to arrange to visit the student.

We wish the student a full and speedy recovery.`,
  }),

  T({
    id: "trip-consent",
    cat: "sports",
    title: "Educational Trip Consent",
    desc: "Announces a school trip and collects parental consent.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "EDUCATIONAL TRIP – {{destination}}",
    body: `As part of the school's learning programme, students will take an educational trip as detailed below. We invite {{studentName}} of {{className}} to participate.

| Destination | {{destination}} |
| Purpose | {{tripPurpose}} |
| Date | {{activityDate}} |
| Departure / Return | {{departureTime}} / {{returnTime}} |
| Cost per Student | KES {{activityCost}} |
| Teacher in Charge | {{teacherInCharge}} |

Students should carry:
- Their school ID, a packed lunch and a water bottle
- Comfortable clothing and closed shoes suitable for the trip, and a sweater or raincoat
- A notebook and pen for the learning activities

Students will be supervised by teachers throughout and must follow the trip rules. The school may withdraw from the trip any student who behaves unsafely. Please return the slip below, together with the trip fee, by {{consentDeadline}}.

# Parent/guardian consent
I, ______________________________, parent/guardian of {{studentName}} (Adm. No. {{admissionNo}}), consent to the student's participation in the trip to {{destination}}. I confirm that the student is in good health.

${CONSENT_SLIP_LINE}`,
  }),

  T({
    id: "commendation",
    cat: "sports",
    title: "Commendation / Award Letter",
    desc: "Recognises a student's achievement in sports or academics.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "COMMENDATION – {{studentName}}",
    body: `It gives us great pleasure to commend {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} for the following achievement, recorded on {{achievementDate}}:

{{achievement}}

This accomplishment brings honour to the student, to the family and to {{schoolName}}. {{commendationNote}}

On behalf of the school community, we congratulate {{studentName}} and thank you for your support.`,
  }),

  /* -------------------------- DISCIPLINE & TRANSFERS ------------------------ */
  T({
    id: "disciplinary",
    cat: "discipline",
    title: "Disciplinary Notice Letter",
    desc: "Informs a parent of a disciplinary matter and invites a meeting.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "DISCIPLINARY NOTICE – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `We write to inform you of a disciplinary matter involving {{studentName}} of {{className}}.

| Date of Incident | {{incidentDate}} |
| Nature of Incident | {{incidentDescription}} |
| Action Taken | {{actionTaken}} |

The conduct described is contrary to the school rules and regulations. The school's approach to discipline is corrective, aimed at guiding the student towards responsible behaviour, and the student was given an opportunity to respond to the matter.

You are kindly invited to meet the school administration on {{meetingDate}} at {{meetingTime}} to discuss the matter and agree on how best we can support the student going forward. Your cooperation is greatly appreciated.`,
  }),

  T({
    id: "suspension",
    cat: "discipline",
    title: "Suspension Letter",
    desc: "Notifies a parent that a student has been suspended.",
    note: "Suspension has legal and procedural implications. Confirm that your school's discipline procedure (and the Board of Management, where required) has been followed before issuing this letter.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "SUSPENSION FROM SCHOOL – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `This letter serves to notify you that {{studentName}} of {{className}} has been suspended from school.

| Reason | {{offence}} |
| Suspension Effective | {{suspensionFrom}} |
| Expected Return | {{returnDate}} |

The decision was made after consideration of the matter under the school's discipline policy. During the suspension, the student is expected to remain at home under your supervision and to keep up with schoolwork where possible.

Conditions for return: {{conditions}}

We view suspension as a corrective measure and remain committed to supporting the student to return and succeed. Please contact the school office if you wish to discuss this matter.`,
  }),

  T({
    id: "expulsion",
    cat: "discipline",
    title: "Expulsion / Dismissal Letter",
    desc: "Notifies a parent of a student's dismissal from school.",
    note: "Expulsion is a serious action and must be a last resort. Make sure due process (a hearing, Board of Management approval and any approval required by the education authorities) has been followed before issuing this letter.",
    to: "The Parent/Guardian of {{studentName}}",
    subject: "DISMISSAL FROM SCHOOL – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `We regret to inform you that, following due consideration of the matter described below, {{decisionBody}} has decided that {{studentName}} (Adm. No. {{admissionNo}}) of {{className}} be dismissed from {{schoolName}}.

| Reason | {{offence}} |
| Effective Date | {{effectiveDate}} |

Please report to the school administration to collect the student's belongings and to complete the clearance process. The student's transfer documents will be released once clearance is complete.

{{appealDetails}}

We thank you for your partnership during the student's time at the school and wish the student well in future.`,
  }),

  T({
    id: "transfer-out",
    cat: "discipline",
    title: "Transfer Letter (Release)",
    desc: "Releases a student to transfer to another school.",
    salutation: "Dear Sir/Madam,",
    to: "The Principal\n{{receivingSchool}}",
    subject: "TRANSFER OF STUDENT – {{studentName}} (Adm. No. {{admissionNo}})",
    body: `We write to confirm that {{studentName}} has been a student of {{schoolName}} since {{dateAdmitted}} and was most recently in {{className}}.

The student is being released to your school {{transferReason}}. The student's general conduct at this school has been rated as {{conduct}}. {{clearanceStatus}}

The following documents accompany this letter:
- The latest report form and academic records
- A copy of the student's birth certificate
- The fee statement and clearance
- The school leaving certificate

We wish {{studentName}} every success at your institution.`,
  }),

  /* -------------------------------- STAFF & HR ------------------------------ */
  T({
    id: "appointment",
    cat: "staff",
    title: "Appointment Letter",
    desc: "Offers a teacher or staff member a position.",
    salutation: "Dear {{staffName}},",
    closing: "Yours sincerely,",
    to: "{{staffName}}",
    subject: "LETTER OF APPOINTMENT – {{position}}",
    body: `Following your application and subsequent interview, we are pleased to offer you appointment as {{position}} at {{schoolName}} on the terms below.

| Position | {{position}} |
| Department | {{department}} |
| Terms of Service | {{contractType}} |
| Effective Date | {{startDate}} |
| Probation Period | {{probationPeriod}} |
| Gross Monthly Salary | KES {{grossSalary}} |
| Reporting To | {{reportsTo}} |

Your appointment is subject to:
- Satisfactory verification of your academic and professional certificates
- Registration with the relevant regulatory body (for example, TSC registration) where applicable
- Adherence to the school's staff code of conduct, policies and regulations
- Statutory deductions as required by law

Please confirm your acceptance by signing and returning a copy of this letter by {{acceptanceDeadline}}. We look forward to welcoming you to the team.

# Acceptance
I, {{staffName}}, accept the appointment on the terms stated above.

Signature: ______________________     Date: ________________`,
  }),

  T({
    id: "staff-confirmation",
    cat: "staff",
    title: "Employment Confirmation Letter",
    desc: "Confirms a staff member after probation.",
    salutation: "Dear {{staffName}},",
    closing: "Yours sincerely,",
    to: "{{staffName}}",
    subject: "CONFIRMATION OF EMPLOYMENT – {{position}}",
    body: `We refer to your appointment as {{position}} at {{schoolName}}, which took effect on {{dateJoined}}.

{{performanceNote}} We are pleased to confirm you in your appointment with effect from {{confirmationDate}}.

All other terms and conditions of your appointment remain unchanged. Congratulations, and thank you for your contribution to the school. We look forward to your continued commitment and growth.`,
  }),

  T({
    id: "staff-warning",
    cat: "staff",
    title: "Staff Warning Letter",
    desc: "A formal written warning to a staff member.",
    note: "Follow your school's HR policy and the terms of the employment contract before issuing a warning. Keep a signed copy on the staff member's file.",
    salutation: "Dear {{staffName}},",
    closing: "Yours sincerely,",
    to: "{{staffName}}",
    subject: "WRITTEN WARNING – {{staffName}}",
    body: `We write to formally address a concern regarding your conduct or performance as {{position}}.

| Date of Incident | {{incidentDate}} |
| Nature of Concern | {{issue}} |
| Status | {{previousWarning}} |

{{expectedImprovement}} Your progress will be reviewed on {{reviewDate}}.

You are advised that further breaches may lead to more serious disciplinary action in accordance with your terms of service and applicable labour laws. You are entitled to respond to this letter in writing within the period allowed by the school's HR policy.

Kindly sign the duplicate copy to acknowledge receipt of this letter. Signing does not imply agreement with its contents.

Acknowledged by: ______________________     Date: ________________`,
  }),

  T({
    id: "leave-approval",
    cat: "staff",
    title: "Leave Approval Letter",
    desc: "Approves a staff member's leave request.",
    salutation: "Dear {{staffName}},",
    closing: "Yours sincerely,",
    to: "{{staffName}}",
    subject: "APPROVAL OF LEAVE – {{leaveType}}",
    body: `We refer to your request for leave, which has been considered and approved as follows.

| Position | {{position}} |
| Type of Leave | {{leaveType}} |
| Leave Starts | {{leaveFrom}} |
| Leave Ends | {{leaveTo}} |
| Resumes Duty On | {{resumeDate}} |

{{relievingArrangement}}

Please ensure that all pending duties are handed over before you proceed on leave. We wish you a restful and productive break.`,
  }),

  T({
    id: "attachment",
    cat: "staff",
    title: "Internship / Attachment Recommendation",
    desc: "Certifies and recommends a trainee or attachee.",
    salutation: WHOM,
    subject: "ATTACHMENT RECOMMENDATION – {{traineeName}}",
    body: `This is to certify that {{traineeName}}, a student of {{institution}} pursuing {{courseName}}, undertook attachment at {{schoolName}} in the {{attachDept}} department from {{attachFrom}} to {{attachTo}}.

During this period, the trainee was involved in {{duties}}. The trainee's overall performance was rated as {{performance}}, and the trainee displayed good professional conduct, punctuality and a positive attitude towards work.

We recommend {{traineeName}} for any opportunity that may further their career and wish them every success.`,
  }),
];

/* ==========================================================================
   HELPERS
   ========================================================================== */
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const fmtMoney = (v) => {
  const raw = String(v).trim();
  const n = Number(raw.replace(/,/g, ""));
  return raw === "" || Number.isNaN(n) ? raw : n.toLocaleString("en-KE");
};

const slug = (s) => String(s || "").trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");

const labelOf = (key) => LH_LABELS[key] || F[key]?.label || key;

const placeholderKeys = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

// Turns the template body into blocks: paragraphs, headings, bullet lists and details tables.
function parseBody(text) {
  const blocks = [];
  let para = [];
  let bullets = null;
  let rows = null;
  const flush = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
    if (bullets) {
      blocks.push({ type: "ul", items: bullets });
      bullets = null;
    }
    if (rows) {
      blocks.push({ type: "table", rows });
      rows = null;
    }
  };
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) return flush();
    if (line.startsWith("# ")) {
      flush();
      blocks.push({ type: "h", text: line.slice(2) });
    } else if (line.startsWith("- ")) {
      if (para.length || rows) flush();
      if (!bullets) bullets = [];
      bullets.push(line.slice(2));
    } else if (line.startsWith("|")) {
      if (para.length || bullets) flush();
      if (!rows) rows = [];
      rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
    } else {
      if (bullets || rows) flush();
      para.push(line);
    }
  });
  flush();
  return blocks;
}

// Loads the logo as base64 (needed for the PDF and the print window) along with its size.
const loadLogo = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve({ data: canvas.toDataURL("image/png"), w: img.width, h: img.height });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

const readLetterhead = () => {
  try {
    const raw = localStorage.getItem(LH_KEY);
    return raw ? { ...DEFAULT_LH, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
};

/* ==========================================================================
   STYLES - one block, shared by the on-screen preview and the print window
   ========================================================================== */
const LETTER_CSS = `
.lp{font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;line-height:1.55;color:#1e293b}
.lp .lh{text-align:center}
.lp .lh-logo{height:64px;width:auto;max-width:200px;object-fit:contain;margin-bottom:6px}
.lp .lh-name{font-size:17pt;font-weight:700;color:#0f2f5c;letter-spacing:.04em;text-transform:uppercase;line-height:1.25}
.lp .lh-line{font-size:9pt;color:#475569}
.lp .lh-motto{font-size:9pt;font-style:italic;color:#0f2f5c;margin-top:2px}
.lp .lh-rule{border-top:2.5px solid #0f2f5c;border-bottom:1px solid #0f2f5c;height:3px;margin:10px 0 18px}
.lp .meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:14px}
.lp .to{margin-bottom:12px;font-weight:600}
.lp p{margin:0 0 10px}
.lp .subj{font-weight:700;text-decoration:underline;margin:14px 0}
.lp h4{font-size:10.5pt;font-weight:700;color:#0f2f5c;margin:14px 0 6px;break-after:avoid;page-break-after:avoid}
.lp ul{margin:0 0 10px;padding-left:20px}
.lp li{margin-bottom:3px}
.lp table.kv{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:10pt}
.lp table.kv tr{break-inside:avoid;page-break-inside:avoid}
.lp table.kv th,.lp table.kv td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left;vertical-align:top}
.lp table.kv th{background:#f1f5f9;color:#334155;width:34%;font-weight:600}
.lp .closing{margin-top:18px;margin-bottom:0;break-after:avoid;page-break-after:avoid}
.lp .sign{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:6px;break-inside:avoid;page-break-inside:avoid}
.lp .sign-space{height:44px}
.lp .sign-line{width:210px;max-width:100%;border-top:1px solid #64748b}
.lp .sign-name{font-weight:700;text-transform:uppercase;margin-top:4px}
.lp .sign-title{color:#334155}
.lp .sign-school{color:#64748b;font-size:9.5pt}
.lp .stamp{flex-shrink:0;width:96px;height:96px;border:1.5px dashed #94a3b8;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:#94a3b8;font-size:8pt;letter-spacing:.06em;text-transform:uppercase;line-height:1.3}
.lp .lp-foot{margin-top:26px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;font-size:8pt;color:#94a3b8}
.lp mark.ph{background:#fef08a;color:#854d0e;padding:0 2px;border-radius:2px}
`;

const PAGE_CSS = `
.letter-paper{background:#fff;border:1px solid var(--border-color);border-radius:6px;box-shadow:var(--shadow-sm);padding:30px 36px;max-width:794px;margin:0 auto}
@media(max-width:575px){.letter-paper{padding:18px 16px}}
.letter-card-icon{width:42px;height:42px;border-radius:var(--radius-md);background:var(--blue-100);color:var(--blue-700);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0}
.letter-card:hover .letter-card-icon{background:var(--blue-700);color:#fff}
.letter-body-editor{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5}
`;

/* ==========================================================================
   PAGE
   ========================================================================== */
export default function Letters() {
  const savedLh = readLetterhead();
  const [lh, setLh] = useState(savedLh || DEFAULT_LH);
  const [showLh, setShowLh] = useState(!savedLh); // first visit: ask for the letterhead details
  const [activeId, setActiveId] = useState(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [values, setValues] = useState({ letterDate: todayISO(), refNo: "" });
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [customBodies, setCustomBodies] = useState({});
  const [editingBody, setEditingBody] = useState(false);
  const [logo, setLogo] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    loadLogo(logoImage).then(setLogo);
  }, []);

  const t = TEMPLATES.find((x) => x.id === activeId) || null;

  const updateLh = (key, value) =>
    setLh((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(LH_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable - letterhead simply won't be remembered */
      }
      return next;
    });

  const setVal = (key, value) => setValues((p) => ({ ...p, [key]: value }));

  const openTemplate = (tpl) => {
    setActiveId(tpl.id);
    setSignerTitle(tpl.signerTitle || "Principal");
    setEditingBody(false);
    document.querySelector(".app-shell__main")?.scrollTo({ top: 0 });
  };

  /* ---------- value resolution ---------- */
  const rawValue = (key) => {
    if (LH_KEYS.includes(key)) return lh[key] || "";
    if (key === "signerName") return signerName || lh.principalName || "";
    if (key === "signerTitle") return signerTitle;
    if (values[key] !== undefined) return values[key];
    return F[key]?.def ?? "";
  };

  const displayValue = (key) => {
    const v = String(rawValue(key) ?? "").trim();
    if (!v) return "";
    const type = F[key]?.type;
    if (type === "date") return fmtDate(v);
    if (type === "money") return fmtMoney(v);
    return v;
  };

  // Fills {{keys}}. Empty fields show as [Field name] so nothing is silently missing.
  const fillText = (str) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, k) => displayValue(k) || `[${labelOf(k)}]`);

  const fillHtml = (str, highlight) =>
    esc(str).replace(/\{\{(\w+)\}\}/g, (_, k) => {
      const v = displayValue(k);
      if (v) return esc(v).replace(/\n/g, "<br>");
      const ph = esc(`[${labelOf(k)}]`);
      return highlight ? `<mark class="ph">${ph}</mark>` : ph;
    });

  /* ---------- derived data for the active template ---------- */
  const body = t ? (customBodies[t.id] ?? t.body) : "";
  const blocks = t ? parseBody(body) : [];
  const usedKeys = t
    ? placeholderKeys([t.to || "", t.salutation, t.subject, body].join("\n"))
    : [];
  const formKeys = [...new Set(usedKeys)].filter((k) => F[k] && !SPECIAL_KEYS.has(k));
  const missing = t
    ? [...new Set([...usedKeys, "signerName", "signerTitle"])].filter((k) => !displayValue(k))
    : [];

  /* ---------- HTML (preview + print) ---------- */
  const buildLetterHtml = (highlight) => {
    const f = (s) => fillHtml(s, highlight);
    const contact = [lh.schoolPhone && `Tel: ${lh.schoolPhone}`, lh.schoolEmail].filter(Boolean).join("   |   ");
    let h = `<div class="lh">`;
    if (lh.showLogo && logo) h += `<img class="lh-logo" src="${logo.data}" alt="" />`;
    h += `<div class="lh-name">${esc(lh.schoolName || "School Name")}</div>`;
    if (lh.schoolAddress) h += `<div class="lh-line">${esc(lh.schoolAddress)}</div>`;
    if (contact) h += `<div class="lh-line">${esc(contact)}</div>`;
    if (lh.schoolMotto) h += `<div class="lh-motto">${esc(lh.schoolMotto)}</div>`;
    h += `</div><div class="lh-rule"></div>`;

    h += `<div class="meta"><span>${values.refNo ? `Our Ref: ${esc(values.refNo)}` : ""}</span><span>${esc(
      fmtDate(rawValue("letterDate"))
    )}</span></div>`;
    if (t.to) h += `<div class="to">${f(t.to).replace(/\n/g, "<br>")}</div>`;
    h += `<p>${f(t.salutation)}</p><p class="subj">${f(t.subject)}</p>`;

    blocks.forEach((b) => {
      if (b.type === "p") h += `<p>${f(b.text)}</p>`;
      else if (b.type === "h") h += `<h4>${f(b.text)}</h4>`;
      else if (b.type === "ul") h += `<ul>${b.items.map((i) => `<li>${f(i)}</li>`).join("")}</ul>`;
      else if (b.type === "table")
        h += `<table class="kv">${b.rows
          .map((r) => `<tr><th>${f(r[0] || "")}</th><td>${f(r.slice(1).join(" | "))}</td></tr>`)
          .join("")}</table>`;
    });

    h += `<p class="closing">${esc(t.closing)}</p>`;
    h += `<div class="sign"><div>
            <div class="sign-space"></div><div class="sign-line"></div>
            <div class="sign-name">${f("{{signerName}}")}</div>
            <div class="sign-title">${f("{{signerTitle}}")}</div>
            <div class="sign-school">${esc(lh.schoolName)}</div>
          </div><div class="stamp">Official<br/>Stamp</div></div>`;

    const foot = [lh.schoolName, lh.schoolAddress, lh.schoolPhone, lh.schoolEmail].filter(Boolean).join("   |   ");
    if (foot) h += `<div class="lp-foot">${esc(foot)}</div>`;
    return h;
  };

  const nameForFile = () => values.studentName || values.staffName || values.traineeName || "";

  /* ---------- PRINT ---------- */
  const printLetter = () => {
    if (!t) return;
    setBusy("print");
    const title = esc(`${t.title} ${nameForFile()}`.trim());
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${title}</title>
      <style>@page{size:A4 portrait;margin:16mm 18mm}html,body{margin:0;padding:0;background:#fff}${LETTER_CSS}</style>
      </head><body><div class="lp">${buildLetterHtml(false)}</div></body></html>`;

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden",
    });
    document.body.appendChild(iframe);
    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } finally {
        setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 500);
        setBusy("");
      }
    }, 250);
  };

  /* ---------- PDF DOWNLOAD ---------- */
  const downloadPdf = async () => {
    if (!t) return;
    setBusy("pdf");
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 20;
      const CW = W - 2 * M;
      const BOTTOM = H - 24;
      const NAVY = [15, 47, 92];
      const INK = [30, 41, 59];
      const MUTED = [100, 116, 139];
      let y = 15;

      const need = (h) => {
        if (y + h > BOTTOM) {
          doc.addPage();
          y = 20;
        }
      };

      const write = (text, o = {}) => {
        const { size = 10.5, bold = false, italic = false, color = INK, x = M, width = CW, after = 3, align = "left", underline = false } = o;
        doc.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(...color);
        const step = size * 0.5;
        doc.splitTextToSize(text, width).forEach((line) => {
          need(step);
          doc.text(line, align === "center" ? W / 2 : x, y, { align });
          if (underline) {
            const w = doc.getTextWidth(line);
            doc.setDrawColor(...color);
            doc.setLineWidth(0.25);
            doc.line(x, y + 1, x + w, y + 1);
          }
          y += step;
        });
        y += after;
      };

      // --- letterhead ---
      if (lh.showLogo && logo) {
        const hh = 18;
        const ww = (hh * logo.w) / logo.h;
        doc.addImage(logo.data, "PNG", (W - ww) / 2, y, ww, hh);
        y += hh + 3;
      }
      y += 5;
      write((lh.schoolName || "School Name").toUpperCase(), { size: 16, bold: true, color: NAVY, align: "center", after: 1 });
      if (lh.schoolAddress) write(lh.schoolAddress, { size: 9, color: MUTED, align: "center", after: 0.5 });
      const contact = [lh.schoolPhone && `Tel: ${lh.schoolPhone}`, lh.schoolEmail].filter(Boolean).join("   |   ");
      if (contact) write(contact, { size: 9, color: MUTED, align: "center", after: 0.5 });
      if (lh.schoolMotto) write(lh.schoolMotto, { size: 9, italic: true, color: NAVY, align: "center", after: 0 });
      y += 2;
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.7);
      doc.line(M, y, W - M, y);
      doc.setLineWidth(0.2);
      doc.line(M, y + 1.3, W - M, y + 1.3);
      y += 9;

      // --- reference + date ---
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      if (values.refNo) doc.text(`Our Ref: ${values.refNo}`, M, y);
      doc.text(fmtDate(rawValue("letterDate")), W - M, y, { align: "right" });
      y += 8;

      // --- addressee, salutation, subject ---
      if (t.to) {
        fillText(t.to).split("\n").forEach((line) => write(line, { bold: true, after: 0 }));
        y += 4;
      }
      write(fillText(t.salutation));
      write(fillText(t.subject), { bold: true, underline: true, after: 5 });

      // --- body ---
      blocks.forEach((b) => {
        if (b.type === "p") {
          write(fillText(b.text));
        } else if (b.type === "h") {
          need(14);
          write(fillText(b.text), { bold: true, color: NAVY, after: 2 });
        } else if (b.type === "ul") {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10.5);
          doc.setTextColor(...INK);
          b.items.forEach((item) => {
            doc.splitTextToSize(fillText(item), CW - 8).forEach((line, i) => {
              need(5.25);
              if (i === 0) doc.text("•", M + 2, y);
              doc.text(line, M + 7, y);
              y += 5.25;
            });
            y += 0.8;
          });
          y += 2.5;
        } else if (b.type === "table") {
          autoTable(doc, {
            startY: y,
            theme: "grid",
            body: b.rows.map((r) => [fillText(r[0] || ""), fillText(r.slice(1).join(" | "))]),
            styles: { fontSize: 9.5, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.15, textColor: INK },
            columnStyles: { 0: { cellWidth: 52, fontStyle: "bold", fillColor: [241, 245, 249], textColor: [51, 65, 85] } },
            margin: { left: M, right: M, bottom: 24 },
          });
          y = doc.lastAutoTable.finalY + 5;
        }
      });

      // --- closing, signature, stamp ---
      need(62);
      y += 3;
      write(t.closing, { after: 0 });
      y += 16;
      const signTop = y;
      doc.setDrawColor(...MUTED);
      doc.setLineWidth(0.3);
      doc.line(M, y, M + 62, y);
      y += 5;
      write(fillText("{{signerName}}").toUpperCase(), { bold: true, after: 0.5 });
      write(fillText("{{signerTitle}}"), { after: 0.5 });
      write(lh.schoolName || "", { size: 9.5, color: MUTED, after: 0 });

      const cx = W - M - 16;
      doc.setLineDashPattern([1.2, 1.2], 0);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.circle(cx, signTop - 2, 15);
      doc.setLineDashPattern([], 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("OFFICIAL", cx, signTop - 3.5, { align: "center" });
      doc.text("STAMP", cx, signTop + 0.5, { align: "center" });

      // --- footer on every page ---
      const footText = [lh.schoolName, lh.schoolAddress, lh.schoolPhone, lh.schoolEmail].filter(Boolean).join("   |   ");
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(M, H - 15, W - M, H - 15);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        if (footText) doc.text(footText, W / 2, H - 10.5, { align: "center" });
        if (pages > 1) doc.text(`Page ${p} of ${pages}`, W - M, H - 6.5, { align: "right" });
      }

      const parts = [slug(t.title), slug(nameForFile()), todayISO()].filter(Boolean);
      doc.save(`${parts.join("_")}.pdf`);
    } catch (err) {
      console.error("Failed to generate letter PDF:", err);
    } finally {
      setBusy("");
    }
  };

  /* ---------- form field renderer ---------- */
  const renderField = (key) => {
    const d = F[key] || { label: key };
    const v = rawValue(key);
    const onChange = (e) => setVal(key, e.target.value);
    let input;
    if (d.type === "textarea") {
      input = <textarea className="form-control" rows={3} value={v} onChange={onChange} placeholder={d.ph} />;
    } else if (d.type === "select") {
      input = (
        <select className="form-select" value={v} onChange={onChange}>
          {d.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    } else {
      input = (
        <input
          className="form-control"
          type={d.type === "date" ? "date" : "text"}
          inputMode={d.type === "money" ? "decimal" : undefined}
          value={v}
          onChange={onChange}
          placeholder={d.ph}
        />
      );
    }
    return (
      <div key={key} className={d.type === "textarea" ? "col-12" : "col-12 col-sm-6"}>
        <label className="form-label">{d.label}</label>
        {input}
      </div>
    );
  };

  /* ---------- gallery filtering ---------- */
  const q = search.trim().toLowerCase();
  const visible = TEMPLATES.filter(
    (x) =>
      (category === "all" || x.cat === category) &&
      (!q || x.title.toLowerCase().includes(q) || x.desc.toLowerCase().includes(q))
  );

  /* ---------- letterhead panel ---------- */
  const letterheadPanel = showLh && (
    <div className="card mb-4">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
          <div>
            <div style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-building me-2" style={{ color: "var(--blue-700)" }}></i>
              School letterhead
            </div>
            <div className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
              Set these once. They print at the top of every letter and are remembered on this device.
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowLh(false)}>
            Done
          </button>
        </div>
        <div className="row g-2">
          {[
            ["schoolName", "School name", "col-md-6", "Junda High School Shanzu"],
            ["schoolAddress", "Address", "col-md-6", "e.g. P.O. Box 123-40100, Kisumu"],
            ["schoolPhone", "Phone", "col-md-4", "e.g. 0712 345 678"],
            ["schoolEmail", "Email", "col-md-4", "e.g. info@jundahigh.sc.ke"],
            ["principalName", "Principal's name", "col-md-4", "e.g. Mr. John Kamau"],
            ["schoolMotto", "Motto (optional)", "col-12", "e.g. Strive for Excellence"],
          ].map(([key, label, col, ph]) => (
            <div key={key} className={`col-12 ${col}`}>
              <label className="form-label">{label}</label>
              <input className="form-control" value={lh[key]} placeholder={ph} onChange={(e) => updateLh(key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="form-check mt-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="lh-logo"
            checked={lh.showLogo}
            onChange={(e) => updateLh("showLogo", e.target.checked)}
          />
          <label className="form-check-label" htmlFor="lh-logo" style={{ fontSize: "var(--fs-sm)" }}>
            Show the school logo on letters
          </label>
        </div>
      </div>
    </div>
  );

  /* ==========================================================================
     RENDER
     ========================================================================== */
  return (
    <div>
      <style>{LETTER_CSS + PAGE_CSS}</style>

      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Letters & Documents", href: "#" },
        ]}
      />

      {/* ------------------------------ HEADER ------------------------------ */}
      <div className="page-header">
        <div>
          {t && (
            <button type="button" className="btn btn-sm btn-outline-secondary mb-2" onClick={() => setActiveId(null)}>
              <i className="bi bi-arrow-left me-1"></i>All templates
            </button>
          )}
          <h1 className="page-title">{t ? t.title : "Letters & Documents"}</h1>
          <p className="page-subtitle">
            {t ? t.desc : "Choose a ready-made letter, fill in the details, then print it or download a PDF."}
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowLh((v) => !v)}>
            <i className="bi bi-building me-1"></i>Letterhead
          </button>
          {t && (
            <>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={printLetter} disabled={!!busy}>
                <i className="bi bi-printer me-1"></i>Print
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={downloadPdf} disabled={!!busy}>
                {busy === "pdf" ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Preparing...
                  </>
                ) : (
                  <>
                    <i className="bi bi-file-earmark-pdf me-1"></i>Download PDF
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {letterheadPanel}

      {/* ------------------------------ GALLERY ----------------------------- */}
      {!t && (
        <>
          <div className="toolbar">
            <div className="toolbar__search">
              <i className="bi bi-search"></i>
              <input
                className="form-control"
                placeholder="Search letters, e.g. sick, fees, sports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <ul className="nav nav-pills mb-4 flex-wrap gap-1">
            <li className="nav-item">
              <button type="button" className={`nav-link ${category === "all" ? "active" : ""}`} onClick={() => setCategory("all")}>
                All <span className="ms-1" style={{ opacity: 0.75 }}>{TEMPLATES.length}</span>
              </button>
            </li>
            {CATEGORIES.map((c) => (
              <li className="nav-item" key={c.id}>
                <button type="button" className={`nav-link ${category === c.id ? "active" : ""}`} onClick={() => setCategory(c.id)}>
                  <i className={`bi ${c.icon} me-1`}></i>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>

          {visible.length === 0 ? (
            <div className="table-wrap">
              <div className="empty-state">
                <i className="bi bi-search"></i>
                <h6>No letters found</h6>
                <p className="text-muted-soft">Try a different search or category.</p>
              </div>
            </div>
          ) : (
            CATEGORIES.map((c) => {
              const items = visible.filter((x) => x.cat === c.id);
              if (!items.length) return null;
              return (
                <div key={c.id} className="mb-4">
                  <div className="section-label mb-2">
                    <i className={`bi ${c.icon} me-1`}></i>
                    {c.label}
                  </div>
                  <div className="row g-3">
                    {items.map((x) => (
                      <div key={x.id} className="col-12 col-md-6 col-xl-4">
                        <div
                          className="card card--interactive letter-card h-100"
                          role="button"
                          tabIndex={0}
                          onClick={() => openTemplate(x)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openTemplate(x)}
                        >
                          <div className="card-body d-flex gap-3 align-items-start" style={{ padding: "0.9rem 1rem" }}>
                            <div className="letter-card-icon">
                              <i className={`bi ${c.icon}`}></i>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: "var(--ink-900)", fontSize: "var(--fs-md)" }}>{x.title}</div>
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-sm)", marginTop: 2 }}>{x.desc}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ------------------------------ EDITOR ------------------------------ */}
      {t && (
        <div className="row g-4">
          <div className="col-lg-5">
            <div className="card">
              <div className="card-body">
                {t.note && (
                  <div className="alert alert-warning py-2 mb-3" style={{ fontSize: "var(--fs-sm)" }}>
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    {t.note}
                  </div>
                )}

                <div className="section-label mb-2">Letter details</div>
                <div className="row g-2">
                  {renderField("letterDate")}
                  {renderField("refNo")}
                  {formKeys.map(renderField)}
                </div>

                <hr className="my-3" />
                <div className="section-label mb-2">Signed by</div>
                <div className="row g-2">
                  <div className="col-12 col-sm-6">
                    <label className="form-label">Name</label>
                    <input
                      className="form-control"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder={lh.principalName || "Signatory's name"}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label">Title</label>
                    <input className="form-control" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
                  </div>
                </div>

                <hr className="my-3" />
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <div className="section-label">Wording</div>
                  <div className="d-flex gap-2">
                    {customBodies[t.id] !== undefined && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() =>
                          setCustomBodies((p) => {
                            const n = { ...p };
                            delete n[t.id];
                            return n;
                          })
                        }
                      >
                        <i className="bi bi-arrow-counterclockwise me-1"></i>Reset
                      </button>
                    )}
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingBody((v) => !v)}>
                      <i className={`bi ${editingBody ? "bi-check2" : "bi-pencil"} me-1`}></i>
                      {editingBody ? "Done" : "Edit wording"}
                    </button>
                  </div>
                </div>
                {editingBody && (
                  <div className="mt-2">
                    <textarea
                      className="form-control letter-body-editor"
                      rows={14}
                      value={body}
                      onChange={(e) => setCustomBodies((p) => ({ ...p, [t.id]: e.target.value }))}
                    />
                    <div className="form-text-hint">
                      Keep <code>{"{{fields}}"}</code> to fill in details automatically. Start a line with <code>- </code> for a
                      bullet, <code># </code> for a heading, or write <code>| Label | Value |</code> for a table row. Leave a blank
                      line between paragraphs.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-lg-7">
            {missing.length > 0 && (
              <div className="alert alert-warning py-2 mb-3" style={{ fontSize: "var(--fs-sm)" }}>
                <i className="bi bi-info-circle me-2"></i>
                {missing.length} field{missing.length !== 1 ? "s" : ""} still blank (highlighted below). Blank fields print as
                [Field name]: {missing.map(labelOf).join(", ")}.
              </div>
            )}
            <div className="letter-paper">
              <div className="lp" dangerouslySetInnerHTML={{ __html: buildLetterHtml(true) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
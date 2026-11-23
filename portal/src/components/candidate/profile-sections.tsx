"use client";

import type { Education, Experience, Publication, Reference } from "@/lib/db/schema";
import { DEGREE_LEVELS } from "@/lib/constants";
import type { ActionState } from "@/lib/action-state";
import { RowEditor, type RowField } from "./row-editor";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const educationFields: RowField[] = [
  { key: "degree", label: "Degree title", placeholder: "MS Computer Science", required: true },
  { key: "level", label: "Level", type: "select", options: DEGREE_LEVELS, required: true },
  { key: "institution", label: "Institution", required: true },
  { key: "field", label: "Field of study" },
  { key: "year", label: "Year completed", inputMode: "numeric", placeholder: "2018", required: true },
  { key: "grade", label: "Grade, CGPA or division", placeholder: "3.6/4 or First division" },
];

const experienceFields: RowField[] = [
  { key: "designation", label: "Designation", required: true },
  { key: "employer", label: "Employer", required: true },
  { key: "from", label: "From", type: "date", required: true },
  { key: "to", label: "To", type: "date", hint: "Leave blank if this is your current job" },
  { key: "current", label: "I work here now", type: "checkbox", wide: true },
  { key: "duties", label: "Main duties", type: "textarea", wide: true },
];

const publicationFields: RowField[] = [
  { key: "title", label: "Title", wide: true, required: true },
  { key: "journal", label: "Journal or book", required: true },
  { key: "year", label: "Year", inputMode: "numeric", required: true },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "published", label: "Published" },
      { value: "accepted", label: "Accepted" },
      { value: "under_review", label: "Under review" },
    ],
  },
  {
    key: "articleType",
    label: "Article type",
    type: "select",
    options: [
      { value: "original_research", label: "Original research" },
      { value: "review", label: "Review" },
      { value: "book_chapter", label: "Book chapter" },
    ],
  },
  { key: "authors", label: "All authors, in order", wide: true, hint: "Separate names with semicolons, such as A. Khan; R. Malik; J. Smith", required: true },
  { key: "authorPosition", label: "Your author position", type: "number", hint: "1 if you are the first author", required: true },
  {
    key: "quartile",
    label: "Journal quartile",
    type: "select",
    options: [
      { value: "", label: "Not known" },
      { value: "Q1", label: "Q1" },
      { value: "Q2", label: "Q2" },
      { value: "Q3", label: "Q3" },
      { value: "Q4", label: "Q4" },
    ],
  },
  { key: "doi", label: "DOI or link", wide: true, placeholder: "10.1000/xyz123 or https://..." },
];

const referenceFields: RowField[] = [
  { key: "name", label: "Name", required: true },
  { key: "designation", label: "Designation" },
  { key: "organisation", label: "Organisation" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

export function EducationEditor({ rows, action }: { rows: Education[]; action: Action }) {
  return (
    <RowEditor
      section="education"
      fields={educationFields}
      initial={rows}
      blank={{ degree: "", level: "4", institution: "", field: "", year: "", grade: "" }}
      itemLabel="Qualification"
      addLabel="Add a qualification"
      emptyText="Add your degrees, starting with the highest."
      action={action}
    />
  );
}

export function ExperienceEditor({ rows, action }: { rows: Experience[]; action: Action }) {
  return (
    <RowEditor
      section="experience"
      fields={experienceFields}
      initial={rows.map((r) => ({ ...r, current: !!r.current }))}
      blank={{ designation: "", employer: "", from: "", to: "", current: false, duties: "" }}
      itemLabel="Job"
      addLabel="Add a job"
      emptyText="Add your work experience, most recent first."
      action={action}
    />
  );
}

export function PublicationEditor({ rows, action }: { rows: Publication[]; action: Action }) {
  return (
    <RowEditor
      section="publications"
      fields={publicationFields}
      initial={rows}
      blank={{ title: "", journal: "", year: "", status: "published", articleType: "original_research", authors: "", authorPosition: 1, quartile: "", doi: "" }}
      itemLabel="Publication"
      addLabel="Add a publication"
      emptyText="Faculty applicants: add your research outputs. Others can leave this empty."
      action={action}
    />
  );
}

export function ReferenceEditor({ rows, action }: { rows: Reference[]; action: Action }) {
  return (
    <RowEditor
      section="references"
      fields={referenceFields}
      initial={rows}
      blank={{ name: "", designation: "", organisation: "", email: "", phone: "" }}
      itemLabel="Reference"
      addLabel="Add a reference"
      emptyText="Add at least two people who can speak about your work."
      action={action}
    />
  );
}

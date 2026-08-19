export interface PromptTemplate {
  id: string
  version: number
  label: string
  template: string
}

/**
 * The blueprint's own "AI Sub-Agent System Prompts" (§7), reproduced verbatim
 * (including its own `{{var}}` / `{{#each}}` placeholder syntax, which is why
 * render.ts's renderer matches that syntax rather than inventing a new one) —
 * Agents A through D. `ERR_OUT_OF_BOUNDS_LEGAL_CORPUS` in Agent A's prompt is a
 * literal sentinel string Stage 9's grounded-Q&A caller (Chunk 39) will need to
 * detect verbatim in the model's response — preserved exactly, not paraphrased.
 */
export const AGENT_A_GROUNDED_QA: PromptTemplate = {
  id: 'agent-a-grounded-qa',
  version: 1,
  label: 'Agent A: Grounded RAG Enforcer',
  template: `You are an authoritative legal research assistant operating within a highly constrained knowledge boundary.
Your sole knowledge source is the set of EXCERPTS provided below. You MUST NOT use any outside knowledge,
legal training, or general reasoning about the law.

RULES:
- Answer the USER QUESTION using ONLY the EXCERPTS.
- For every factual or legal statement, provide a PINPOINT CITATION in brackets, using the exact format
  from the excerpt's [Source] tag. Example: [Wash. Rev. Code § 4.16.080].
- If the EXCERPTS contain the necessary information, answer completely and concisely.
- If the EXCERPTS do not contain sufficient information to answer the question even partially,
  respond with exactly the system code ERR_OUT_OF_BOUNDS_LEGAL_CORPUS followed by a brief explanation
  of what title, chapter, or section appears to be missing (e.g., "Missing: Rules of Civil Procedure
  regarding default judgment").
- Never speculate, paraphrase law not present in the excerpts, or use your own understanding.
- If the user asks about court deadlines, calculate the exact date if the trigger date is provided in the excerpts.
- Do not advise on strategy; only state what the law requires.

EXCERPTS:
{{#each retrieved_chunks}}
[Source: {{source_ref}}] {{chunk_text}}
{{/each}}

USER QUESTION: {{user_query}}

YOUR ANSWER:`,
}

export const AGENT_B_OPPOSING_FILING_AUDITOR: PromptTemplate = {
  id: 'agent-b-opposing-filing-auditor',
  version: 1,
  label: 'Agent B: Opposing Filing Auditor',
  template: `You are a sharp-eyed litigation analyst assisting a self-represented litigant.
You will be given the FULL TEXT of an opposing party's legal filing and, optionally,
the relevant LOCAL COURT RULES and STATUTES.

Perform the following analysis and return a STRICTLY STRUCTURED JSON object (described below).
Do not include any text outside the JSON.

1. CLAIMS AND ALLEGATIONS: Extract every distinct legal claim or factual allegation made by the opposing party.
   For each, list "allegation" and "type" (claim or factual_allegation).
2. PROCEDURAL REQUIREMENTS ANALYSIS: Identify any missing procedural prerequisites under the provided rules/statutes
   (e.g., failure to state a claim, lack of verification, improper service). For each, specify the relevant citation.
3. FACTUAL CONTRADICTIONS: Note any internal contradictions within the filing.
4. ARGUMENT STRENGTH ASSESSMENT: Rate the overall legal strength (1=very weak, 10=extremely strong).
5. ACTIONABLE RESPONSE OPTIONS: Suggest 2-4 concrete response strategies grounded in the provided rules/statutes.

OUTPUT JSON STRUCTURE:
{
  "claims_allegations": [{"allegation": string, "type": string}],
  "procedural_gaps": [{"description": string, "rule_citation": string}],
  "factual_contradictions": [string],
  "argument_strength_score": integer,
  "response_options": [{"title": string, "legal_basis": string, "suggested_text": string}]
}

If the provided context does not contain the necessary local rules, still complete the analysis but
mark each gap with "rule_citation": "NOT PROVIDED". Never invent a rule.

FILING TEXT:
{{filing_text}}

RELEVANT RULES AND STATUTES:
{{retrieved_legal_chunks}}`,
}

export const AGENT_C_PDF_FIELD_EXTRACTOR: PromptTemplate = {
  id: 'agent-c-pdf-field-extractor',
  version: 1,
  label: 'Agent C: PDF Field Extractor',
  template: `You are a document layout analyst specialized in court forms. You receive the OCR text and
bounding box data for a single page of a PDF form.

TASK: Identify all fillable areas and classify them as SINGLE_LINE or MULTI_LINE_RULED.

For each area, return an object with:
- "field_id": a unique string
- "type": "SINGLE_LINE" or "MULTI_LINE_RULED"
- "bounding_box": { "left": float, "top": float, "width": float, "height": float } in points (origin top-left)
- "label": any text label near the field
- "suggested_global_key": from ["party_plaintiff_name", "party_defendant_name", "case_number", "court_name", "judge_name", "filing_date", "case_type", "other"]

For MULTI_LINE_RULED fields, additionally provide:
- "baseline_y_offset": Y distance from bounding_box.top to first baseline
- "line_height": average vertical distance between baselines
- "max_lines": estimated number of physical lines

CONTEXT:
OCR Text and Layout: {{ocr_text_with_bboxes}}

RETURN ONLY A VALID JSON ARRAY with no other text.`,
}

export const AGENT_D_MOTION_DRAFTER: PromptTemplate = {
  id: 'agent-d-motion-drafter',
  version: 1,
  label: 'Agent D: Court Motion Drafter (Enhanced)',
  template: `You are a meticulous legal drafting assistant. You will produce a complete first draft of a legal motion
or pleading for a self-represented litigant.

RULES:
- The document must follow this structure exactly:
  1. COURT CAPTION (court name, case number, parties)
  2. TITLE OF THE MOTION/PLEADING
  3. STATEMENT OF FACTS (concise, derived only from the provided case context)
  4. LEGAL ARGUMENT & AUTHORITIES (each point must cite a specific statute or rule from the
     provided LEGAL CORPUS, using pinpoint citation format)
  5. PRAYER FOR RELIEF (what the court is asked to do)
  6. RESPECTFULLY SUBMITTED with signature line and date
  7. CERTIFICATE OF SERVICE (if indicated)

- You MUST NOT use any legal authority that is not explicitly present in the provided LEGAL CORPUS.
  If you lack authority for a necessary argument, note in the text that legal research is needed.
- Use formal legal language. Keep the draft ready for filing with proper formatting.
- The output must be a JSON object with two fields:
  "title": the motion title
  "body": the full plain-text body of the document, with line breaks and section headings.

CASE CONTEXT:
Court: {{court_name}}
Case Number: {{case_number}}
Parties: Plaintiff {{plaintiff_name}} vs. Defendant {{defendant_name}}
Summary of Facts: {{facts_summary}}
Motion Type: {{motion_type}}

LEGAL CORPUS:
{{retrieved_legal_chunks}}

RETURN ONLY THE JSON OBJECT, no preamble.`,
}

/**
 * NOT from the blueprint — §7 explicitly leaves Agent E without a prompt
 * ("Used only when ambiguity requires LLM confirmation; otherwise rule-based"),
 * unlike A-D, which it specifies verbatim. Drafted here, from that one-sentence
 * description of its actual job (Chunk 21's rule-based redaction engine escalates
 * to this only for genuinely ambiguous cases it can't resolve on its own — Chunk
 * 41), and labeled as such rather than presented as blueprint text it isn't.
 */
export const AGENT_E_REDACTION_ASSIST: PromptTemplate = {
  id: 'agent-e-redaction-assist',
  version: 1,
  label: 'Agent E: PII Redaction Assistant (not in the blueprint — drafted for this app)',
  template: `You are assisting with redaction of sensitive personal information from a legal document.
A rule-based scanner has already found the confident cases; you are being asked ONLY about text
spans it flagged as ambiguous.

RULES:
- For each CANDIDATE below, decide whether it is genuinely a sensitive identifier (SSN, date of birth,
  a minor's identifying information, or a financial account number) or a false positive.
- Use only the surrounding CONTEXT provided. Do not guess based on outside knowledge of the document.
- Return ONLY a JSON array, one object per candidate, in the same order: {"id": string, "is_sensitive": boolean, "reason": string}.

CANDIDATES:
{{#each candidates}}
[{{id}}] "{{text}}" — context: "{{context}}"
{{/each}}`,
}

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  AGENT_A_GROUNDED_QA,
  AGENT_B_OPPOSING_FILING_AUDITOR,
  AGENT_C_PDF_FIELD_EXTRACTOR,
  AGENT_D_MOTION_DRAFTER,
  AGENT_E_REDACTION_ASSIST,
]

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id)
}

/**
 * The blueprint's §8.1 three-stage drafting workflow (outline → full draft →
 * critique/revision) — the actual per-stage prompts Agent D's real pipeline
 * (Chunk 43) will run in sequence, distinct from AGENT_D_MOTION_DRAFTER above
 * (which is the single-shot version §7 defines; §8 supersedes it with this
 * iterative process for higher-quality output).
 */
export const DRAFTING_OUTLINE_PROMPT: PromptTemplate = {
  id: 'drafting-outline',
  version: 1,
  label: 'Drafting stage 1: Outline',
  template:
    'Generate a structured outline with the legal arguments and citations you will use, based solely on the provided case facts and legal corpus. Return as JSON with sections array.\n\nCASE FACTS:\n{{facts_summary}}\n\nLEGAL CORPUS:\n{{retrieved_legal_chunks}}',
}

export const DRAFTING_FULL_DRAFT_PROMPT: PromptTemplate = {
  id: 'drafting-full-draft',
  version: 1,
  label: 'Drafting stage 2: Full draft',
  template:
    'Follow the outline precisely; write the full motion using only the provided authorities. Do not deviate or add arguments not in the outline.\n\nAPPROVED OUTLINE:\n{{outline}}\n\nLEGAL CORPUS:\n{{retrieved_legal_chunks}}',
}

export const DRAFTING_CRITIQUE_PROMPT: PromptTemplate = {
  id: 'drafting-critique',
  version: 1,
  label: 'Drafting stage 3: Review & revision',
  template:
    'You are a senior litigation partner. Critique the following draft for clarity, legal accuracy, formatting, and citation correctness. Then produce a revised version that fixes all identified issues.\n\nDRAFT:\n{{draft}}',
}

export interface StyleGuide {
  id: string
  jurisdiction: string
  label: string
  text: string
}

/**
 * The blueprint's §8.3 style-guide mechanism, seeded with its own worked example
 * (California Superior Court, County of Los Angeles) — narrow on purpose, the same
 * "one real, checked jurisdiction over fifty guessed ones" discipline as every
 * other seeded table in this app.
 */
export const STYLE_GUIDES: readonly StyleGuide[] = [
  {
    id: 'ca-la-superior-court',
    jurisdiction: 'CA',
    label: 'California Superior Court, County of Los Angeles',
    text: `[STYLE GUIDE - California Superior Court, County of Los Angeles]
- All documents must be on 28-line pleading paper.
- Paragraphs must be numbered consecutively.
- Double-spaced text; single-spaced for footnotes and block quotes.
- Font: Times New Roman, 12pt minimum.
- Margins: 1.5 inches left, 1 inch all others.
- Case numbers and party names must appear in the caption exactly as on the complaint.
- Citations must use California Style Manual format.
- Signature block must include printed name, address, phone, and email of self-represented litigant.`,
  },
]

export function styleGuideFor(jurisdiction: string): StyleGuide | undefined {
  return STYLE_GUIDES.find((g) => g.jurisdiction === jurisdiction)
}

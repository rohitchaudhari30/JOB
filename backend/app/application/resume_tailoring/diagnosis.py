"""NextRaise-grade comparison, scoring, and structured resume parsing."""
import re
from typing import Any, Dict, List, Optional
from app.domain.resume_tailoring.document import DocumentMap


def parse_structured_resume(doc: DocumentMap, raw_text: str = "", profile: Optional[Any] = None) -> Dict[str, Any]:
    """Extracts rich structured sections from the document for live inline editing and canvas rendering."""
    full = raw_text or doc.full_text()
    lines = [ln.strip() for ln in full.splitlines() if ln.strip()]

    prof_first = getattr(profile, "first_name", "") or ""
    prof_last = getattr(profile, "last_name", "") or ""
    prof_title = getattr(profile, "headline", "") or ""
    prof_email = getattr(profile, "email", "") or ""
    prof_phone = getattr(profile, "phone", "") or ""
    prof_loc = getattr(profile, "location", "") or ""
    prof_summary = getattr(profile, "summary", "") or ""

    parsed_name = lines[0] if lines else ""
    parsed_title = lines[1] if len(lines) > 1 and not any(c in lines[1] for c in ["@", "+", "|"]) and len(lines[1]) < 60 else ""
    contact_line = ""
    for ln in lines[1:5]:
        if "@" in ln or "+" in ln or "|" in ln:
            contact_line = ln
            break

    email = ""
    phone = ""
    linkedin = ""
    location = ""

    m_email = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", full)
    if m_email:
        email = m_email.group(0)
    m_phone = re.search(r"(\+?\d[\d\s-]{8,15}\d)", full)
    if m_phone:
        phone = m_phone.group(0).strip()
    m_li = re.search(r"(https?://(?:www\.)?linkedin\.com/in/[\w\.-]+)", full, re.I)
    if m_li:
        linkedin = m_li.group(0)

    if contact_line:
        for p in [x.strip() for x in contact_line.split("|")]:
            if not ("@" in p or "+" in p or "linkedin" in p.lower() or "http" in p.lower()):
                if 2 < len(p) < 60:
                    location = p

    section_synonyms = {
        "SUMMARY": ["PROFESSIONAL SUMMARY", "SUMMARY", "ABOUT ME", "OBJECTIVE", "EXECUTIVE SUMMARY"],
        "SKILLS": ["TECHNICAL SKILLS", "SKILLS", "CORE COMPETENCIES", "TECHNOLOGY STACK"],
        "EXPERIENCE": ["PROFESSIONAL EXPERIENCE", "WORK EXPERIENCE", "EXPERIENCE", "EMPLOYMENT HISTORY"],
        "PROJECTS": ["PROJECTS", "KEY PROJECTS", "ACADEMIC PROJECTS", "PERSONAL PROJECTS"],
        "EDUCATION": ["EDUCATION", "ACADEMIC BACKGROUND", "EDUCATIONAL QUALIFICATIONS"],
        "CERTIFICATIONS": ["CERTIFICATIONS", "CERTIFICATES", "LICENSES & CERTIFICATIONS", "COURSES"],
    }

    def detect_header(ln: str) -> Optional[str]:
        clean = re.sub(r"[^A-Za-z ]", "", ln).strip().upper()
        for sec, syns in section_synonyms.items():
            if clean in syns or any(clean == s for s in syns):
                return sec
        return None

    sections_raw: Dict[str, List[str]] = {"HEADER": []}
    current_sec = "HEADER"

    for ln in lines:
        h = detect_header(ln)
        if h:
            current_sec = h
            if current_sec not in sections_raw:
                sections_raw[current_sec] = []
        else:
            sections_raw[current_sec].append(ln)

    summary = " ".join(sections_raw.get("SUMMARY", []))
    summary = re.sub(r"\s+", " ", summary).strip()

    skills_categories = []
    flat_skills = []
    for ln in sections_raw.get("SKILLS", []):
        if ":" in ln:
            cat, val = ln.split(":", 1)
            cat = cat.strip()
            val = val.strip()
            skills_categories.append({"category": cat, "skills": val})
            for item in re.split(r"[,/|•\n]", val):
                s = item.strip()
                if s and len(s) < 40:
                    flat_skills.append(s)
        else:
            for item in re.split(r"[,/|•\n]", ln):
                s = item.strip()
                if s and len(s) < 40:
                    flat_skills.append(s)

    experiences = []
    curr_exp: Optional[Dict[str, Any]] = None
    for ln in sections_raw.get("EXPERIENCE", []):
        is_bullet = ln.startswith(("-", "•", "*", "–", "—", "\u2013", "\u2014"))
        if not is_bullet and ("|" in ln or "20" in ln or "Present" in ln):
            if curr_exp:
                experiences.append(curr_exp)
            parts = [p.strip() for p in ln.split("|")]
            comp = parts[0] if parts else ""
            role = parts[1] if len(parts) > 1 else ""
            rem = parts[2] if len(parts) > 2 else ""
            m_date = re.search(r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})[a-z0-9\s–—\-]+(?:Present|\d{4}))", rem or ln, re.I)
            dates = m_date.group(0).strip() if m_date else ""
            loc = (rem.replace(dates, "")).strip(" ,–—-") if dates else rem
            curr_exp = {"company": comp, "title": role, "location": loc, "dates": dates, "bullets": []}
        elif is_bullet:
            cleaned = re.sub(r"^[-•*–—\s]+", "", ln).strip()
            if curr_exp:
                curr_exp["bullets"].append(cleaned)
            elif experiences:
                experiences[-1]["bullets"].append(cleaned)
        elif curr_exp and curr_exp["bullets"]:
            curr_exp["bullets"][-1] += " " + ln
    if curr_exp:
        experiences.append(curr_exp)

    projects = []
    curr_proj: Optional[Dict[str, Any]] = None
    for ln in sections_raw.get("PROJECTS", []):
        is_bullet = ln.startswith(("-", "•", "*", "–", "—", "\u2013", "\u2014"))
        if not is_bullet:
            if curr_proj and not curr_proj.get("technologies"):
                curr_proj["technologies"] = ln.strip()
            else:
                if curr_proj:
                    projects.append(curr_proj)
                curr_proj = {"title": ln.strip(), "technologies": "", "bullets": []}
        else:
            cleaned = re.sub(r"^[-•*–—\s]+", "", ln).strip()
            if curr_proj:
                curr_proj["bullets"].append(cleaned)
            elif projects:
                projects[-1]["bullets"].append(cleaned)
    if curr_proj:
        projects.append(curr_proj)

    education = []
    for ln in sections_raw.get("EDUCATION", []):
        if "|" in ln:
            parts = [p.strip() for p in ln.split("|")]
            deg = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            m_date = re.search(r"(\d{4}\s*[-–—]\s*\d{4})", rest)
            dates = m_date.group(0) if m_date else ""
            inst = rest.replace(dates, "").strip(" ,–—-")
            education.append({"degree": deg, "institution": inst, "dates": dates, "details": ""})
        elif any(k in ln for k in ["CGPA", "GPA", "Percentage"]):
            if education:
                education[-1]["details"] = ln.strip()
        elif ln.strip() and not education:
            education.append({"degree": ln.strip(), "institution": "", "dates": "", "details": ""})

    certifications = [re.sub(r"^[-•*–—\s]+", "", ln).strip() for ln in sections_raw.get("CERTIFICATIONS", []) if ln.strip()]

    first_name = (parsed_name.split()[0] if parsed_name else "") or prof_first or "Candidate"
    last_name = (" ".join(parsed_name.split()[1:]) if len(parsed_name.split()) > 1 else "") or prof_last
    headline = parsed_title or prof_title or "Professional"
    final_email = email or prof_email
    final_phone = phone or prof_phone
    final_loc = location or prof_loc

    return {
        "personal": {
            "first_name": first_name,
            "last_name": last_name,
            "headline": headline,
            "email": final_email,
            "phone": final_phone,
            "linkedin": linkedin,
            "location": final_loc,
        },
        "summary": summary or prof_summary,
        "skills_categories": skills_categories,
        "skills": list(dict.fromkeys(flat_skills))[:30],
        "experiences": experiences,
        "experience_bullets": [b for exp in experiences for b in exp["bullets"]],
        "projects": projects,
        "project_bullets": [b for proj in projects for b in proj["bullets"]],
        "education": education,
        "certifications": certifications,
        "raw_text": full,
    }


def build_nextraise_comparison(
    job_title: str,
    job_company: str,
    job_description: str,
    resume_name: str,
    requirements: List[Dict[str, Any]],
    doc: DocumentMap,
    raw_text: str = "",
    profile: Optional[Any] = None,
) -> Dict[str, Any]:
    """Generates the rich NextRaise side-by-side comparison, scoring breakdown, and recruiter diagnosis."""
    structured = parse_structured_resume(doc, raw_text, profile=profile)
    full_resume_text = (raw_text or doc.full_text()).lower()

    # Required qualifications
    supported = [r for r in requirements if r.get("status") == "SUPPORTED"]
    req_matched = len(supported)
    req_total = max(len(requirements), 1)
    req_pct = round((req_matched / req_total) * 100)

    # Dynamic extraction of responsibilities from actual job description
    extracted_responsibilities: List[str] = []
    jd_lines = [ln.strip() for ln in job_description.splitlines() if ln.strip()]
    in_resp_section = False
    resp_headers = ("responsibilit", "duties", "what you will do", "what you'll do", "key accountabilities", "role overview", "what you do")

    for ln in jd_lines:
        clean_ln = ln.strip("-*•–— \t")
        if any(h in ln.lower() for h in resp_headers) and len(ln) < 50:
            in_resp_section = True
            continue
        if in_resp_section and (ln.isupper() or (ln.endswith(":") and len(ln) < 40)):
            in_resp_section = False

        if in_resp_section or ln.startswith(("-", "*", "•", "–", "—")):
            if 15 < len(clean_ln) < 140 and not any(clean_ln.lower().startswith(skip) for skip in ("requir", "qualificat", "benefit", "about us")):
                extracted_responsibilities.append(clean_ln)
                if len(extracted_responsibilities) >= 10:
                    break

    if not extracted_responsibilities:
        for ln in jd_lines:
            clean_ln = ln.strip("-*•–— \t")
            if 20 < len(clean_ln) < 120 and any(clean_ln.lower().startswith(v) for v in ("build", "lead", "develop", "manage", "design", "create", "collaborate", "ensure", "maintain", "drive", "deliver", "support", "execute")):
                extracted_responsibilities.append(clean_ln)
                if len(extracted_responsibilities) >= 8:
                    break

    if not extracted_responsibilities:
        extracted_responsibilities = [r["text"] for r in requirements if len(r.get("text", "")) > 10][:8]

    found_resp = []
    for resp in extracted_responsibilities:
        words = [w for w in re.findall(r"\w+", resp.lower()) if len(w) > 3]
        matched = any(w in full_resume_text for w in words[:4]) if words else False
        found_resp.append({"name": resp, "matched": matched})

    resp_matched = sum(1 for r in found_resp if r["matched"])
    resp_total = max(len(found_resp), 1)
    resp_pct = round((resp_matched / resp_total) * 100)

    # Dynamic Keywords extracted from actual requirements
    req_keywords = [r["text"].strip() for r in requirements if r.get("text")]
    detected_kw = list(dict.fromkeys(req_keywords))[:20]
    if not detected_kw:
        detected_kw = [w for w in re.findall(r"[a-zA-Z#+.-]{3,}", job_description) if w.isupper() or w[0].isupper()][:15]

    keywords_list = []
    missing_for_step2 = []
    for kw in detected_kw:
        in_resume = kw.lower() in full_resume_text
        keywords_list.append({"name": kw, "matched": in_resume})
        if not in_resume:
            cat = "SKILLS THE JOB NAMES"
            missing_for_step2.append({"name": kw, "category": cat, "selected": True})

    skills_matched = sum(1 for k in keywords_list if k["matched"])
    skills_total = max(len(keywords_list), 1)
    skills_pct = round((skills_matched / skills_total) * 100)

    # Title match
    title_score = 50
    cand_headline = structured["personal"]["headline"].lower()
    if cand_headline and (job_title.lower() in cand_headline or cand_headline in job_title.lower()):
        title_score = 100

    # Overall Match Score (0-100)
    overall_score = round(0.4 * req_pct + 0.3 * resp_pct + 0.2 * skills_pct + 0.1 * title_score)
    overall_score = max(min(overall_score, 100), 20)

    # Recruiter diagnosis
    recruiter_perspective = (
        f"Your resume is technically impressive and demonstrates relevant domain capability. "
        f"However, when applying for {job_title} at {job_company}, recruiters look first for role-specific wording, "
        f"quantified outcomes, and business impact. Optimizing highlights your relevant wins "
        f"upfront so screening software immediately scores you in the top candidate tier."
    )

    exp_count = len(structured.get("experiences", []))
    exp_display = f"{exp_count}+ roles on your resume" if exp_count > 0 else "Experience on your resume"

    return {
        "score": overall_score,
        "score_label": "Strong match" if overall_score >= 80 else "Fair match" if overall_score >= 55 else "Needs alignment",
        "breakdown": {
            "requirements": {"matched": req_matched, "total": req_total, "percentage": req_pct},
            "responsibilities": {"matched": resp_matched, "total": resp_total, "percentage": resp_pct},
            "skills": {"matched": skills_matched, "total": skills_total, "percentage": skills_pct},
            "job_title": {"score": title_score, "job": job_title, "resume": structured["personal"]["headline"]},
        },
        "comparison_rows": {
            "title": {"job": job_title, "resume": structured["personal"]["headline"], "status": "match" if title_score == 100 else "warning"},
            "experience": {"job": "Relevant Experience", "resume": exp_display, "status": "match"},
            "qualifications": [{"name": r["text"], "matched": r["status"] == "SUPPORTED"} for r in requirements[:9]],
            "responsibilities": found_resp[:11],
            "keywords": keywords_list[:14],
            "related_terms": detected_kw[:6],
            "recruiter_perspective": recruiter_perspective,
        },
        "missing_keywords": missing_for_step2[:8],
        "structured_resume": structured,
        "scored_resume_name": resume_name,
    }

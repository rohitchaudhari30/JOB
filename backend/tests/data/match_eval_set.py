"""Hand-labelled jobs for one backend candidate. Grade: 3 strong, 2 good, 1 weak, 0 poor."""
from app.domain.jobs.entities import Job
from app.domain.profile.entities import CandidateProfile, CandidateSkill


def candidate() -> CandidateProfile:
    skills = ["Python", "FastAPI", "PostgreSQL", "Docker", "AWS", "REST APIs"]
    return CandidateProfile(
        id="p-eval",
        user_id="u-eval",
        headline="Backend Engineer",
        location="Pune",
        total_experience_months=60,
        skills=[CandidateSkill(id=f"s{i}", profile_id="p-eval", skill_name=n) for i, n in enumerate(skills)],
    )


def _job(key: str, title: str, description: str, years: float = 3.0, location: str = "Pune") -> Job:
    return Job(
        id=f"j-{key}", source_id="s", external_job_id=key, title=title, company="Acme",
        location=location, min_experience_years=years, raw_description=description,
    )


LABELLED_JOBS = [
    (3, _job("a1", "Backend Engineer", "Build REST APIs with Python, FastAPI and PostgreSQL. Docker and AWS deployment.")),
    (3, _job("a2", "Senior Python Developer", "Python, FastAPI, PostgreSQL, Docker. You will own backend services on AWS.", years=4)),
    (3, _job("a3", "Backend Developer", "Design REST APIs in Python with FastAPI. PostgreSQL, Docker, AWS experience needed.")),
    (2, _job("b1", "Backend Engineer", "Python and PostgreSQL services. Some Kubernetes and Terraform. Docker is a plus.")),
    (2, _job("b2", "Software Engineer", "Python APIs, AWS Lambda, DynamoDB. REST design and Docker.", years=2)),
    (2, _job("b3", "Platform Engineer", "Python tooling, Docker, AWS and CI pipelines. Some PostgreSQL.")),
    (1, _job("c1", "Full Stack Developer", "React, TypeScript and Node.js. Occasional Python scripts and Docker.")),
    (1, _job("c2", "Data Engineer", "Spark, Scala and Airflow pipelines. Python and AWS are nice to have.")),
    (1, _job("c3", "Java Developer", "Spring Boot, Hibernate, Oracle. REST APIs in Java.", years=4)),
    (0, _job("d1", "Pastry Chef", "Bake bread and croissants every morning in our bakery.", years=0)),
    (0, _job("d2", "Graphic Designer", "Photoshop, Illustrator and brand identity work for retail clients.", years=0)),
    (0, _job("d3", "Sales Executive", "Cold calling, negotiation and closing enterprise leads.", years=1)),
]

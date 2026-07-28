import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
BLOCKS_DIR = REPO_ROOT / "cv-ai" / "prompt-blocks"

SECTOR_MAP = [
    (re.compile(r"(soft|develop|engineer|data|devops|\bit\b|yazılım|bilişim|teknoloji)", re.IGNORECASE), "tech"),
    (re.compile(r"(financ|bank|invest|account|audit|finans|muhasebe|denetim)", re.IGNORECASE), "finance"),
    (re.compile(r"(design|market|brand|content|advert|creative|tasarım|pazarlama|reklam)", re.IGNORECASE), "creative"),
    (re.compile(r"(logist|warehouse|manufact|construct|retail|driver|production|lojistik|üretim|inşaat|perakende)", re.IGNORECASE), "operational"),
]

def pick_persona(seniority: str) -> str:
    if seniority == "academic":
        return "academic"
    elif seniority == "executive":
        return "executive"
    elif seniority in ("senior", "mid"):
        return "experienced"
    elif seniority == "entry":
        return "early_career"
    else:
        raise ValueError(f"Unknown seniority: {seniority}")

def pick_sector(target_sector: str) -> str:
    for pattern, sector in SECTOR_MAP:
        if pattern.search(target_sector):
            return sector
    return "general"

def pick_localization(target_region: str, sector: str, company_type_hint: str = "unknown") -> str:
    if company_type_hint == "multinational":
        return "intl_multinational"
    if company_type_hint == "domestic":
        return "tr_domestic"
    
    # Inference fallback: region outside Turkey OR tech sector (multinational/remote-heavy)
    abroad = not bool(re.search(r"türkiye|turkey|tr\b|istanbul|ankara|izmir", target_region, re.IGNORECASE))
    if abroad:
        return "intl_multinational"
    if sector == "tech":
        return "intl_multinational"
    return "tr_domestic"

def select_persona_profile(current_title: str, target_role: str, target_sector: str, target_region: str, seniority: str, company_type_hint: str = "unknown") -> dict:
    persona = pick_persona(seniority)
    sector_overlay = pick_sector(target_sector)
    localization = pick_localization(target_region, sector_overlay, company_type_hint)
    return {
        "persona": persona,
        "sector_overlay": sector_overlay,
        "localization": localization,
        "example": persona,
        "output_language": "tr" if localization == "tr_domestic" else "en"
    }

def load_block(*parts: str) -> str:
    path = BLOCKS_DIR.joinpath(*parts)
    return path.read_text(encoding="utf-8").strip()

def assemble_prompt(profile: dict, mode: str) -> str:
    segments = [
        load_block("core", "core.md"),
        load_block("core", "output-contract.md"),
        load_block("personas", f"{profile['persona']}.md"),
        load_block("sectors", f"{profile['sector_overlay']}.md"),
        load_block("localization", f"{profile['localization']}.md"),
        load_block("examples", f"{profile['example']}.md"),
        f'# RUNTIME MODE\nmode: "{mode}"\noutput_language: "{profile["output_language"]}"'
    ]
    return "\n\n---\n\n".join(segments)

def build_score_call(router_answers: dict) -> tuple:
    profile = select_persona_profile(
        current_title=router_answers.get("current_title", ""),
        target_role=router_answers.get("target_role", ""),
        target_sector=router_answers.get("target_sector", ""),
        target_region=router_answers.get("target_region", ""),
        seniority=router_answers.get("seniority", "mid"),
        company_type_hint=router_answers.get("company_type_hint", "unknown")
    )
    system_prompt = assemble_prompt(profile, "score")
    return profile, system_prompt

def build_rebuild_call(stored_profile: dict) -> str:
    return assemble_prompt(stored_profile, "rebuild")

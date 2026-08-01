//! Skills Marketplace — install Exasol's curated agent skills into the user's
//! OTHER AI agents (Claude Code, Codex, Cursor, …) using each provider's OWN
//! tooling. Studio never hand-writes a provider's skill directory; it shells out
//! to the supported installer, mirroring `exasol-agent-skills/install.sh`:
//!   - Claude Code → `claude plugin marketplace add …` + `claude plugin install`
//!   - Codex / Cursor → the cross-agent `skills` CLI via `npx`
//! Skills for Studio's OWN in-app agent go through `skillsApi` in the frontend,
//! not here.

use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::market::{has_binary, run_streamed};

const SKILLS_REPO: &str = "exasol-labs/exasol-agent-skills";
const JOB_ID: &str = "skills-market";

/// A provider Studio can push the Exasol skills into.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTarget {
    pub id: String,
    pub name: String,
    /// The provider's own install tooling is available on this machine.
    pub installed: bool,
    /// Where to get the provider when it isn't installed (never auto-downloaded).
    pub install_url: String,
}

/// The command sequence that installs the Exasol skills into `target_id`, using
/// that provider's OWN tooling. `None` for an unsupported target. Pure (no
/// shell-out) so it is unit-tested against the table.
pub fn install_commands(target_id: &str) -> Option<Vec<(&'static str, Vec<String>)>> {
    match target_id {
        // Claude Code: register the marketplace repo, then install the plugin
        // (user scope) — exactly what the official install.sh runs.
        "claude-code" => Some(vec![
            (
                "claude",
                vec![
                    "plugin".into(),
                    "marketplace".into(),
                    "add".into(),
                    SKILLS_REPO.into(),
                ],
            ),
            (
                "claude",
                vec![
                    "plugin".into(),
                    "install".into(),
                    // plugin@marketplace — the marketplace name is `exasol-skills`
                    // (from the repo's .claude-plugin/marketplace.json), not the
                    // repo slug. `claude plugin install exasol` would fail.
                    "exasol@exasol-skills".into(),
                    "--scope".into(),
                    "user".into(),
                ],
            ),
        ]),
        // Codex / Cursor: the cross-agent `skills` CLI, run via npx.
        "codex" => Some(vec![(
            "npx",
            vec![
                "--yes".into(),
                "skills".into(),
                "add".into(),
                SKILLS_REPO.into(),
                "--agent".into(),
                "codex".into(),
            ],
        )]),
        "cursor" => Some(vec![(
            "npx",
            vec![
                "--yes".into(),
                "skills".into(),
                "add".into(),
                SKILLS_REPO.into(),
                "--agent".into(),
                "cursor".into(),
            ],
        )]),
        _ => None,
    }
}

fn display_name(target_id: &str) -> &'static str {
    match target_id {
        "claude-code" => "Claude Code",
        "codex" => "Codex",
        "cursor" => "Cursor",
        _ => "this agent",
    }
}

fn install_url(target_id: &str) -> &'static str {
    match target_id {
        "claude-code" => "https://docs.anthropic.com/en/docs/claude-code/overview",
        "codex" => "https://github.com/openai/codex",
        "cursor" => "https://cursor.com",
        _ => "https://github.com/exasol-labs/exasol-agent-skills",
    }
}

/// Whether `target_id`'s install tooling is runnable on this machine — the
/// provider's own CLI on PATH. Detection only; the install still surfaces any
/// runtime error (e.g. a missing npx) in its console output.
fn tooling_present(target_id: &str) -> bool {
    match target_id {
        "claude-code" => has_binary("claude"),
        "codex" => has_binary("codex"),
        "cursor" => has_binary("cursor"),
        _ => false,
    }
}

/// The supported skills targets with live install-availability + a link when
/// the provider isn't installed (Studio never downloads the CLIs itself).
pub fn skills_targets() -> Vec<SkillTarget> {
    ["claude-code", "codex", "cursor"]
        .iter()
        .map(|&id| SkillTarget {
            id: id.to_string(),
            name: display_name(id).to_string(),
            installed: tooling_present(id),
            install_url: install_url(id).to_string(),
        })
        .collect()
}

/// Install the Exasol skills into `target_id` via its own tooling. Refuses an
/// unknown target or one whose CLI isn't present (nothing to shell out to).
pub fn install_skills(app: &AppHandle, target_id: &str) -> AppResult<()> {
    let cmds = install_commands(target_id)
        .ok_or_else(|| AppError::InvalidSettings(format!("Unknown skills target `{target_id}`.")))?;
    if !tooling_present(target_id) {
        return Err(AppError::Storage(format!(
            "{} isn't installed on this machine, so its skills can't be installed from here.",
            display_name(target_id)
        )));
    }
    for (program, args) in &cmds {
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        if run_streamed(app, JOB_ID, program, &arg_refs)? != 0 {
            return Err(AppError::Storage(format!(
                "Installing the Exasol skills into {} failed (`{program}`). See the log for details.",
                display_name(target_id)
            )));
        }
    }
    Ok(())
}

/// One Studio-authored persona skill (a role pack's skill), written into an
/// external agent that has no provider tooling of its own.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub body: String,
}

/// Whether `path` currently exists as a symlink (used to refuse writing through
/// one, so a planted symlink can't redirect a skill write out of the root).
fn is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

/// Slugify a skill id into a safe directory/skill name (lowercase, [a-z0-9-]).
fn skill_slug(id: &str) -> String {
    let s: String = id
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.trim_matches('-').to_string();
    if s.is_empty() { "skill".into() } else { s }
}

/// A Claude-Code SKILL.md for one persona skill: YAML frontmatter (name +
/// quoted description) followed by the body. Pure so it can be unit-tested.
fn persona_skill_md(slug: &str, skill: &PersonaSkill) -> String {
    let desc = skill.description.replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        "---\nname: {slug}\ndescription: \"{desc}\"\n---\n\n# {}\n\n{}\n",
        skill.name, skill.body
    )
}

/// Install a Studio persona bundle into an external agent by WRITING its skills
/// (Studio personas have no provider tooling). Only Claude Code is supported —
/// its skills are `~/.claude/skills/<name>/SKILL.md`. The Studio local agent is
/// handled in the frontend via the agent skill API, not here.
pub fn install_persona(target_id: &str, skills: &[PersonaSkill]) -> AppResult<()> {
    match target_id {
        "claude-code" => {
            let base = dirs::home_dir()
                .ok_or_else(|| AppError::Storage("Could not resolve the home directory.".into()))?
                .join(".claude")
                .join("skills");
            // Reject slug collisions up front so one skill can't silently
            // clobber another (or an unrelated existing skill dir).
            let mut seen = std::collections::HashSet::new();
            for skill in skills {
                let slug = skill_slug(&skill.id);
                if !seen.insert(slug.clone()) {
                    return Err(AppError::InvalidSettings(format!(
                        "Two skills resolve to the same name `{slug}`; rename one before installing."
                    )));
                }
            }
            for skill in skills {
                let slug = skill_slug(&skill.id);
                let dir = base.join(&slug);
                // Never follow a symlink out of the skills root: refuse if the
                // slug dir or its SKILL.md already exists as a symlink.
                if is_symlink(&dir) {
                    return Err(AppError::Storage(format!(
                        "Refusing to write through a symlink at {}.",
                        dir.display()
                    )));
                }
                std::fs::create_dir_all(&dir)?;
                let md = dir.join("SKILL.md");
                if is_symlink(&md) {
                    return Err(AppError::Storage(format!(
                        "Refusing to write through a symlink at {}.",
                        md.display()
                    )));
                }
                std::fs::write(md, persona_skill_md(&slug, skill))?;
            }
            Ok(())
        }
        _ => Err(AppError::InvalidSettings(format!(
            "Persona bundles can't be installed into `{target_id}` (no skill format)."
        ))),
    }
}

/// The official skills shipped in exasol-labs/exasol-agent-skills — the ONLY
/// ids installable individually (allowlist; anything else is refused).
pub const OFFICIAL_SKILL_IDS: &[&str] = &[
    "exasol",
    "exasol-ai-setup",
    "exasol-bucketfs",
    "exasol-cloud-storage-extension",
    "exasol-database",
    "exasol-distributed-ml",
    "exasol-document-virtual-schemas",
    "exasol-export",
    "exasol-extension-catalog",
    "exasol-import",
    "exasol-itde",
    "exasol-jdbc-virtual-schemas",
    "exasol-notebook-connections",
    "exasol-text-ai",
    "exasol-transformers",
    "exasol-udfs",
    "exasol-virtual-schema-adapter-development",
    "exasol-setup-personal",
];

/// The skills-CLI agent name for a Studio target id.
fn skills_cli_agent(target_id: &str) -> Option<&'static str> {
    match target_id {
        "claude-code" => Some("claude-code"),
        "codex" => Some("codex"),
        "cursor" => Some("cursor"),
        _ => None,
    }
}

/// Per-skill install command via the cross-agent `skills` CLI:
/// `npx --yes skills add <repo> -a <agent> -s <s1>,<s2> -g -y`. Pure + tested.
/// None for an unsupported target or an id outside the official allowlist.
pub fn official_install_command(target_id: &str, skill_ids: &[String]) -> Option<(&'static str, Vec<String>)> {
    let agent = skills_cli_agent(target_id)?;
    if skill_ids.is_empty() || skill_ids.iter().any(|s| !OFFICIAL_SKILL_IDS.contains(&s.as_str())) {
        return None;
    }
    Some((
        "npx",
        vec![
            "--yes".into(),
            "skills".into(),
            "add".into(),
            SKILLS_REPO.into(),
            "-a".into(),
            agent.into(),
            "-s".into(),
            skill_ids.join(","),
            "-g".into(),
            "-y".into(),
        ],
    ))
}

/// Split a SKILL.md into (frontmatter name, description, body). Tolerant of a
/// missing/short frontmatter block — falls back to the id-derived name. Pure.
pub fn parse_skill_markdown(skill_id: &str, raw: &str) -> PersonaSkill {
    let mut name = skill_id.to_string();
    let mut description = String::new();
    let mut body = raw.to_string();
    let trimmed = raw.trim_start();
    if let Some(rest) = trimmed.strip_prefix("---") {
        // Only a fence that ends its line opens frontmatter — "---text" is body.
        let fence_open = rest.starts_with('\n') || rest.starts_with("\r\n");
        if fence_open {
            if let Some(end) = rest.find("\n---") {
                let front = &rest[..end];
                for line in front.lines() {
                    if let Some(v) = line.strip_prefix("name:") {
                        name = v.trim().trim_matches('"').to_string();
                    } else if let Some(v) = line.strip_prefix("description:") {
                        description = v.trim().trim_matches('"').to_string();
                    }
                }
                // Strip the closing fence + surrounding newlines, incl. CRLF \r.
                body = rest[end + 4..].trim_start_matches(['-', '\n', '\r']).to_string();
            }
        }
    }
    PersonaSkill { id: skill_id.to_string(), name, description, body }
}

/// Fetch one official skill's SKILL.md from the pinned repo (for installing it
/// into Studio's OWN agent, which has no provider tooling). Allowlisted only.
fn fetch_official_skill(skill_id: &str) -> AppResult<PersonaSkill> {
    if !OFFICIAL_SKILL_IDS.contains(&skill_id) {
        return Err(AppError::InvalidSettings(format!("unknown official skill `{skill_id}`")));
    }
    // Ids are the skills-CLI names (SKILL.md frontmatter). One repo DIRECTORY
    // differs from its frontmatter name — map it for the raw fetch.
    let dir = match skill_id {
        "exasol-setup-personal" => "setup-personal",
        other => other,
    };
    let url = format!(
        "https://raw.githubusercontent.com/{SKILLS_REPO}/main/plugins/exasol/skills/{dir}/SKILL.md"
    );
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "exasol-studio")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .map_err(|e| AppError::Storage(format!("Could not fetch the skill: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!(
            "Could not fetch `{skill_id}` (HTTP {}).",
            resp.status()
        )));
    }
    let raw = resp
        .text()
        .map_err(|e| AppError::Storage(format!("Could not read the skill: {e}")))?;
    Ok(parse_skill_markdown(skill_id, &raw))
}

/// Install a set of OFFICIAL skills into an external agent via the skills CLI.
pub fn install_official(app: &AppHandle, target_id: &str, skill_ids: &[String]) -> AppResult<()> {
    let (program, args) = official_install_command(target_id, skill_ids).ok_or_else(|| {
        AppError::InvalidSettings("Unsupported target or unknown skill id.".into())
    })?;
    if !tooling_present(target_id) {
        return Err(AppError::Storage(format!(
            "{} isn't installed on this machine.",
            display_name(target_id)
        )));
    }
    // Resolve npx to an absolute path: the packaged GUI app's own PATH is
    // minimal, and while run_streamed augments the child PATH, resolving here
    // removes any lookup ambiguity and yields a clear error when node is absent.
    let resolved = crate::market::resolve_bin(program)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| program.to_string());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let code = run_streamed(app, JOB_ID, &resolved, &arg_refs)?;
    if code != 0 {
        return Err(AppError::Storage(format!(
            "Installing skills into {} failed (`{program}` exited with {code}).",
            display_name(target_id)
        )));
    }
    Ok(())
}

/// Which OFFICIAL skills each external agent already has, by scanning the
/// agents' skill directories: Claude Code reads `~/.claude/skills/<id>`; the
/// cross-agent `skills` CLI installs Codex skills globally to
/// `~/.agents/skills/<id>` (also probe `~/.codex/skills` for manual installs).
pub fn installed_official_map() -> std::collections::HashMap<String, Vec<String>> {
    let mut map = std::collections::HashMap::new();
    let Some(home) = dirs::home_dir() else {
        return map;
    };
    // Don't follow a symlinked skill dir out of the agent root — probe only
    // real directories (a planted link must not steer the status scan).
    let has = |base: &Path, id: &str| {
        let dir = base.join(id);
        !is_symlink(&dir) && dir.join("SKILL.md").is_file()
    };
    let claude = home.join(".claude").join("skills");
    let agents = home.join(".agents").join("skills");
    let codex = home.join(".codex").join("skills");
    map.insert(
        "claude-code".to_string(),
        OFFICIAL_SKILL_IDS.iter().filter(|id| has(&claude, id)).map(|s| s.to_string()).collect(),
    );
    map.insert(
        "codex".to_string(),
        OFFICIAL_SKILL_IDS
            .iter()
            .filter(|id| has(&agents, id) || has(&codex, id))
            .map(|s| s.to_string())
            .collect(),
    );
    map
}

#[tauri::command]
pub fn skills_installed_official() -> AppResult<std::collections::HashMap<String, Vec<String>>> {
    Ok(installed_official_map())
}

#[tauri::command]
pub fn skills_list_targets() -> AppResult<Vec<SkillTarget>> {
    Ok(skills_targets())
}

#[tauri::command]
pub async fn skills_install_official(app: AppHandle, target: String, skills: Vec<String>) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || install_official(&app, &target, &skills))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

#[tauri::command]
pub async fn skills_fetch_official(skill: String) -> AppResult<PersonaSkill> {
    tauri::async_runtime::spawn_blocking(move || fetch_official_skill(&skill))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

#[tauri::command]
pub async fn skills_install_target(app: AppHandle, target: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || install_skills(&app, &target))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

#[tauri::command]
pub async fn skills_install_persona(target: String, skills: Vec<PersonaSkill>) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || install_persona(&target, &skills))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_code_uses_the_plugin_cli() {
        let cmds = install_commands("claude-code").unwrap();
        assert_eq!(cmds.len(), 2);
        assert_eq!(cmds[0].0, "claude");
        assert_eq!(
            cmds[0].1,
            vec!["plugin", "marketplace", "add", SKILLS_REPO]
        );
        assert_eq!(cmds[1].0, "claude");
        assert_eq!(
            cmds[1].1,
            vec!["plugin", "install", "exasol@exasol-skills", "--scope", "user"]
        );
    }

    #[test]
    fn codex_and_cursor_use_npx_skills_for_the_right_agent() {
        for (id, agent) in [("codex", "codex"), ("cursor", "cursor")] {
            let cmds = install_commands(id).unwrap();
            assert_eq!(cmds.len(), 1, "{id} should be a single npx command");
            assert_eq!(cmds[0].0, "npx");
            assert!(cmds[0].1.contains(&"skills".to_string()));
            assert!(cmds[0].1.contains(&SKILLS_REPO.to_string()));
            assert_eq!(cmds[0].1.last().unwrap(), agent);
        }
    }

    #[test]
    fn unknown_target_has_no_commands() {
        assert!(install_commands("notepad").is_none());
        assert!(install_commands("").is_none());
    }

    #[test]
    fn targets_are_the_three_supported_providers() {
        let ids: Vec<String> = skills_targets().into_iter().map(|t| t.id).collect();
        assert_eq!(ids, vec!["claude-code", "codex", "cursor"]);
    }

    #[test]
    fn skill_slug_is_safe_and_nonempty() {
        assert_eq!(skill_slug("ds-eda"), "ds-eda");
        assert_eq!(skill_slug("BI Metrics!"), "bi-metrics");
        assert_eq!(skill_slug("  --x--  "), "x");
        assert_eq!(skill_slug("***"), "skill");
    }

    #[test]
    fn persona_skill_md_has_frontmatter_and_escapes_description() {
        let md = persona_skill_md(
            "ds-eda",
            &PersonaSkill {
                id: "ds-eda".into(),
                name: "Exploratory analysis".into(),
                description: "Profile a \"dataset\" with SQL".into(),
                body: "Do the thing.".into(),
            },
        );
        assert!(md.starts_with("---\nname: ds-eda\n"));
        assert!(md.contains(r#"description: "Profile a \"dataset\" with SQL""#));
        assert!(md.contains("# Exploratory analysis"));
        assert!(md.trim_end().ends_with("Do the thing."));
    }

    #[test]
    fn install_persona_rejects_unsupported_target() {
        assert!(install_persona("codex", &[]).is_err());
        assert!(install_persona("studio", &[]).is_err());
    }

    #[test]
    fn official_command_targets_the_skills_cli_per_agent() {
        let skills = vec!["exasol-import".to_string(), "exasol-export".to_string()];
        let (prog, args) = official_install_command("codex", &skills).unwrap();
        assert_eq!(prog, "npx");
        assert!(args.contains(&SKILLS_REPO.to_string()));
        let a = args.iter().position(|x| x == "-a").unwrap();
        assert_eq!(args[a + 1], "codex");
        let s = args.iter().position(|x| x == "-s").unwrap();
        assert_eq!(args[s + 1], "exasol-import,exasol-export");
        assert!(args.contains(&"-g".to_string()) && args.contains(&"-y".to_string()));
        // claude-code maps to the CLI's agent name
        let (_, args) = official_install_command("claude-code", &skills).unwrap();
        let a = args.iter().position(|x| x == "-a").unwrap();
        assert_eq!(args[a + 1], "claude-code");
    }

    #[test]
    fn official_command_refuses_unknown_ids_and_targets() {
        let bad = vec!["rm -rf /".to_string()];
        assert!(official_install_command("codex", &bad).is_none());
        assert!(official_install_command("codex", &[]).is_none());
        let ok = vec!["exasol".to_string()];
        assert!(official_install_command("studio", &ok).is_none());
    }

    #[test]
    fn parse_skill_markdown_extracts_frontmatter_and_body() {
        let raw = "---\nname: exasol-import\ndescription: \"Load data fast\"\n---\n\n# Import\n\nBody here.";
        let s = parse_skill_markdown("exasol-import", raw);
        assert_eq!(s.name, "exasol-import");
        assert_eq!(s.description, "Load data fast");
        assert!(s.body.starts_with("# Import"));
        // no frontmatter → id as name, whole text as body
        let s2 = parse_skill_markdown("x", "just text");
        assert_eq!(s2.name, "x");
        assert_eq!(s2.body, "just text");
    }

    #[test]
    fn allowlist_uses_cli_skill_names_not_directories() {
        // The skills CLI resolves names from SKILL.md frontmatter; one repo
        // directory (setup-personal) differs. The allowlist must carry the CLI
        // name or the whole multi-skill install exits 1 ("Available skills:").
        assert!(OFFICIAL_SKILL_IDS.contains(&"exasol-setup-personal"));
        assert!(!OFFICIAL_SKILL_IDS.contains(&"setup-personal"));
        let cmd = official_install_command("codex", &["exasol-setup-personal".to_string()]);
        assert!(cmd.is_some());
    }

    #[test]
    fn install_persona_rejects_slug_collision() {
        let dup = vec![
            PersonaSkill { id: "a b".into(), name: "A".into(), description: String::new(), body: String::new() },
            PersonaSkill { id: "a-b".into(), name: "B".into(), description: String::new(), body: String::new() },
        ];
        // Both ids slugify to "a-b" → must be rejected before any write.
        assert!(install_persona("claude-code", &dup).is_err());
    }
}

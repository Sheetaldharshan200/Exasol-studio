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
#[derive(Debug, Clone, Deserialize)]
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

#[tauri::command]
pub fn skills_list_targets() -> AppResult<Vec<SkillTarget>> {
    Ok(skills_targets())
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
    fn install_persona_rejects_slug_collision() {
        let dup = vec![
            PersonaSkill { id: "a b".into(), name: "A".into(), description: String::new(), body: String::new() },
            PersonaSkill { id: "a-b".into(), name: "B".into(), description: String::new(), body: String::new() },
        ];
        // Both ids slugify to "a-b" → must be rejected before any write.
        assert!(install_persona("claude-code", &dup).is_err());
    }
}

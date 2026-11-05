<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Serialize browser lead mutations per lead through the shared keyed queue so older saves cannot overwrite newer edits.
- Use the shared paginated collector for lead lists and exports; reject failed pages instead of displaying incomplete results.
- Keep webhook addresses on the active published origin, and report synchronization failures rather than counting failed writes as success.
- Use the shared page metadata helper in each content route to keep titles and social descriptions route-specific.

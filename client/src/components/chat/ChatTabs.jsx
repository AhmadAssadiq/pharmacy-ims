// The tabs at the top of a chat page (GP2 addition): the chat with real people, and the
// chat with Rafiq the AI assistant.
//
// tabs: [{ key, label }]   current: the open tab's key   onChange(key): a tab was clicked
export default function ChatTabs({ tabs, current, onChange }) {
  return (
    <div className="toolbar chat-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          className="chip"
          aria-selected={current === tab.key}
          aria-pressed={current === tab.key}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

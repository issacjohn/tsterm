import { Fragment } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAppStore } from '../store'
import { TerminalPane } from './TerminalPane'
import { WelcomeView } from './WelcomeView'

export function TerminalWorkspace(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)

  if (!tabs.length) return <WelcomeView />

  return (
    <div className="terminal-workspace">
      {tabs.map((tab) => {
        const visible = tab.id === activeTabId
        return (
          <div key={tab.id} className="tab-panel" style={{ display: visible ? 'flex' : 'none' }}>
            {tab.panes.length > 1 ? (
              <PanelGroup direction={tab.layout === 'vertical' ? 'vertical' : 'horizontal'} className="split-group">
                {tab.panes.map((pane, index) => (
                  <Fragment key={pane.id}>
                    {index > 0 ? (
                      <PanelResizeHandle
                        className={tab.layout === 'vertical' ? 'resize-handle horizontal' : 'resize-handle vertical'}
                      />
                    ) : null}
                    <Panel minSize={20} defaultSize={50} className="split-panel">
                      <TerminalPane
                        tabId={tab.id}
                        pane={pane}
                        active={visible && tab.activePaneId === pane.id}
                        split
                      />
                    </Panel>
                  </Fragment>
                ))}
              </PanelGroup>
            ) : (
              <TerminalPane
                tabId={tab.id}
                pane={tab.panes[0]}
                active={visible}
                split={false}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

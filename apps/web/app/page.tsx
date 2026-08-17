import EditorShell from '../components/EditorShell';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import SnapViewportHud from '../components/SnapViewportHud';
import WorkspaceToolbar from '../components/WorkspaceToolbar';

export default function Home(){
  return <>
    <EditorShell/>
    <WorkspaceToolbar/>
    <SnapViewportHud/>
    <KeyboardShortcuts/>
  </>;
}

import EditorShell from '../components/EditorShell';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import LabelVisibilityBridge from '../components/LabelVisibilityBridge';
import SnapViewportHud from '../components/SnapViewportHud';
import WorkspaceToolbar from '../components/WorkspaceToolbar';

export default function Home(){
  return <>
    <EditorShell/>
    <WorkspaceToolbar/>
    <SnapViewportHud/>
    <KeyboardShortcuts/>
    <LabelVisibilityBridge/>
  </>;
}

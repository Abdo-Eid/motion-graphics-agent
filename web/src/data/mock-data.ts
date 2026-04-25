import type { AgentName, AgentStatus, SceneStatus } from '../theme/themes'

export type ChatTool = {
  name: string
  args: string
  status: 'done' | 'running'
  result?: string
}

export type ChatMessageData =
  | {
      role: 'user'
      content: string
    }
  | {
      role: 'assistant'
      agent: AgentName
      content: string
      done: boolean
      tag?: string
      tool?: ChatTool
    }

export type SceneRegistryItem = {
  id: string
  name: string
  status: SceneStatus
  file: string | null
  time: string
}

export type AgentLogEntry = {
  agent: AgentName
  status: AgentStatus
  action: string
  time: string
}

export type FileTreeEntry = {
  name: string
  type: 'dir' | 'file'
  depth: number
  active?: boolean
  editing?: boolean
  pending?: boolean
}

export const CHAT_MESSAGES: ChatMessageData[] = [
  {
    role: 'user',
    content:
      'Make a 20-second feature walkthrough for our project management app. Audience is product teams. Feel: confident, modern, focused. Walk through the board view, task detail, timeline, and team collab.',
  },
  {
    role: 'assistant',
    agent: 'Planner',
    content:
      'Brief locked. Goal: feature walkthrough, 20s, product teams. Routing to Art Director for scene structure and visual direction.',
    done: true,
    tag: 'brief',
  },
  {
    role: 'assistant',
    agent: 'Art Director',
    content:
      'Designing 4-scene walkthrough: Board overview (0-5s) · Task detail zoom (5-10s) · Timeline view (10-15s) · Team collab + CTA (15-20s). Style: off-white bg, neutral palette, callout labels on pan between features, smooth cross-fade transitions.',
    done: true,
    tag: 'direction',
  },
  {
    role: 'assistant',
    agent: 'Art Director',
    content: '',
    tool: {
      name: 'write_scene_registry',
      args: '4 scenes · style context saved',
      status: 'done',
    },
    done: true,
  },
  {
    role: 'assistant',
    agent: 'Implementor',
    content: 'Reading scene registry. Loading remotion-transitions skill.',
    tool: {
      name: 'load_skill',
      args: '.skills/remotion-transitions.md',
      status: 'done',
    },
    done: true,
  },
  {
    role: 'assistant',
    agent: 'Implementor',
    content: '',
    tool: {
      name: 'create_file',
      args: 'src/compositions/ProductWalkthrough.tsx',
      status: 'done',
    },
    done: true,
  },
  {
    role: 'assistant',
    agent: 'Implementor',
    content: '',
    tool: {
      name: 'run_typecheck',
      args: '',
      status: 'done',
      result: '✓ No errors (5 files checked)',
    },
    done: true,
  },
  {
    role: 'assistant',
    agent: 'Implementor',
    content: 'Implementing pan + callout animation for timeline scene...',
    tool: {
      name: 'edit_file',
      args: 'scenes/Timeline.tsx',
      status: 'running',
    },
    done: false,
  },
]

export const SCENE_REGISTRY: SceneRegistryItem[] = [
  {
    id: 'S1',
    name: 'Board Overview',
    status: 'done',
    file: 'scenes/Board.tsx',
    time: '0-5s',
  },
  {
    id: 'S2',
    name: 'Task Detail',
    status: 'done',
    file: 'scenes/TaskDetail.tsx',
    time: '5-10s',
  },
  {
    id: 'S3',
    name: 'Timeline',
    status: 'building',
    file: 'scenes/Timeline.tsx',
    time: '10-15s',
  },
  {
    id: 'S4',
    name: 'Team + CTA',
    status: 'pending',
    file: null,
    time: '15-20s',
  },
]

export const AGENT_LOG: AgentLogEntry[] = [
  {
    agent: 'Planner',
    status: 'done',
    action: 'Extracted brief · routed to Art Director',
    time: '0:03',
  },
  {
    agent: 'Art Director',
    status: 'done',
    action: '4-scene direction · style context saved',
    time: '0:11',
  },
  {
    agent: 'Implementor',
    status: 'done',
    action: 'load_skill remotion-transitions',
    time: '0:16',
  },
  {
    agent: 'Implementor',
    status: 'done',
    action: 'Created ProductWalkthrough.tsx',
    time: '0:21',
  },
  {
    agent: 'Implementor',
    status: 'done',
    action: 'run_typecheck → clean (5 files)',
    time: '0:27',
  },
  {
    agent: 'Implementor',
    status: 'running',
    action: 'Editing Timeline.tsx',
    time: '0:33',
  },
]

export const FILE_TREE: FileTreeEntry[] = [
  { name: 'src/', type: 'dir', depth: 0 },
  { name: 'compositions/', type: 'dir', depth: 1 },
  { name: 'ProductWalkthrough.tsx', type: 'file', depth: 2, active: true },
  { name: 'scenes/', type: 'dir', depth: 1 },
  { name: 'Board.tsx', type: 'file', depth: 2 },
  { name: 'TaskDetail.tsx', type: 'file', depth: 2 },
  { name: 'Timeline.tsx', type: 'file', depth: 2, editing: true },
  { name: 'Team.tsx', type: 'file', depth: 2, pending: true },
  { name: 'helpers/', type: 'dir', depth: 1 },
  { name: 'spring.ts', type: 'file', depth: 2 },
  { name: '.skills/', type: 'dir', depth: 0 },
  { name: 'remotion.md', type: 'file', depth: 1 },
  { name: 'remotion-transitions.md', type: 'file', depth: 1 },
]

export const CODE_PREVIEW = `export const Timeline = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Art Director: "pan between features with callout labels"
  const pan = spring({
    frame, fps,
    config: { damping: 20, stiffness: 80 }
  });

  const x = interpolate(pan, [0, 1], [-80, 0]);
  const callout = interpolate(frame, [18, 28], [0, 1], {
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill style={{ background: '#fafaf8' }}>
      <AppFrame style={{ transform: \`translateX(\${x}px)\` }}>
        <TimelineBars frame={frame} fps={fps} />
      </AppFrame>
      <Callout opacity={callout} label="Drag to reschedule" />
    </AbsoluteFill>
  );
};`

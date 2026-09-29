import difflib
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

from restrictInspectors import paths as inspector_paths, restrict_inspectors

root = pathlib.Path(__file__).resolve().parents[1]
engine = pathlib.Path(sys.argv[1]).resolve()
schemas = root.parents[2] / 'packages/api/src/schemas'
schema_names = ['flowEditorProtocolV1', 'flowEditorSessionV1']
schema_hashes = {name: hashlib.sha256((schemas / f'{name}.ts').read_bytes()).hexdigest() for name in schema_names}
pin = 'fec71dca901949c09ed4d63315804337cd2eb13d'
probe = root.parent / 'editor-probe/patches/trellis-editor-probe.patch'
probe_sha = '3632763e66ba2471535f01b16380ca5d5ab0f1c74ca0cf1b3578c6c548d6166c'
assert hashlib.sha256(probe.read_bytes()).hexdigest() == probe_sha
paths = {line.split(' b/')[1] for line in probe.read_text().splitlines() if line.startswith('diff --git ')}
paths |= {
    'src/index.tsx',
    'src/controllers/API/queries/flows/use-get-types.ts',
    'src/hooks/flows/use-save-flow.ts',
    'src/components/core/parameterRenderComponent/index.tsx',
}
paths |= inspector_paths
with tempfile.TemporaryDirectory(prefix='trellis-editor-patch-') as temporary:
    stage = pathlib.Path(temporary)
    for path in sorted(paths):
        source = subprocess.run(['git', '-C', str(engine), 'show', f'{pin}:src/frontend/{path}'], capture_output=True)
        if source.returncode:
            assert path.startswith('src/customization/trellis-editor-'), path
            continue
        target = stage / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.stdout)
    subprocess.run(['git', 'apply', str(probe)], cwd=stage, check=True)
    before = {str(path.relative_to(stage)): path.read_text() for path in stage.rglob('*') if path.is_file()}
    def replace(path, old, new):
        target = stage / path
        source = target.read_text()
        assert old in source, (path, old)
        target.write_text(source.replace(old, new))
    entry = '@/customization/trellis/frontend/entry'
    native = '@/customization/trellis/frontend/nativeDriver'
    mode = '@/customization/trellis/frontend/mode'
    restricted = [
        'src/controllers/API/queries/_builds/use-get-builds.ts',
        'src/pages/DashboardWrapperPage/index.tsx',
        'src/pages/FlowPage/index.tsx',
        'src/pages/FlowPage/components/PageComponent/index.tsx',
    ]
    for path in restricted:
        replace(path, 'TRELLIS_EDITOR_PROBE', 'TRELLIS_EDITOR_RESTRICTED')
    replace('src/customization/trellis-editor-probe.ts',
            'export const TRELLIS_EDITOR_PROBE =',
            f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nexport const TRELLIS_EDITOR_RESTRICTED = TRELLIS_EDITOR_BRIDGE || import.meta.env.TRELLIS_EDITOR_PROBE === true;\nexport const TRELLIS_EDITOR_PROBE =')
    replace('src/index.tsx', 'import "./i18n";', f'import {{ startEditorBridge }} from "{entry}";\nimport "./i18n";')
    replace('src/index.tsx', 'loadLanguage(detectedLang).then(', 'Promise.all([loadLanguage(detectedLang), startEditorBridge()]).then(')
    replace('src/controllers/API/queries/flows/use-get-flow.ts',
            'import { useQueryClient }', f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nimport {{ loadEditorFlow }} from "{entry}";\nimport {{ useQueryClient }}')
    replace('src/controllers/API/queries/flows/use-get-flow.ts',
            '    if (TRELLIS_EDITOR_PROBE) {', '    if (TRELLIS_EDITOR_BRIDGE) return loadEditorFlow(payload.id);\n    if (TRELLIS_EDITOR_PROBE) {')
    replace('src/controllers/API/queries/flows/use-get-types.ts',
            'import { replaceEqualDeep }', f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nimport {{ loadEditorPalette }} from "{entry}";\nimport {{ replaceEqualDeep }}')
    replace('src/controllers/API/queries/flows/use-get-types.ts',
            'const response = await api.get<APIObjectType>(', 'const response = TRELLIS_EDITOR_BRIDGE ? { data: await loadEditorPalette() } : await api.get<APIObjectType>(')
    replace('src/hooks/flows/use-save-flow.ts',
            'import type { ReactFlowJsonObject }', f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nimport type {{ ReactFlowJsonObject }}')
    replace('src/hooks/flows/use-save-flow.ts',
            '    const currentFlow = useFlowStore.getState().currentFlow;', '    if (TRELLIS_EDITOR_BRIDGE) return;\n    const currentFlow = useFlowStore.getState().currentFlow;')
    replace('src/controllers/API/queries/flows/use-patch-update-flow.ts',
            'import { TRELLIS_EDITOR_PROBE }', f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nimport {{ TRELLIS_EDITOR_PROBE }}')
    replace('src/controllers/API/queries/flows/use-patch-update-flow.ts',
            '    if (!TRELLIS_EDITOR_PROBE) {', '    if (TRELLIS_EDITOR_BRIDGE) throw new Error("Use the Trellis workspace to save this draft.");\n    if (!TRELLIS_EDITOR_PROBE) {')
    toolbar = 'src/components/core/flowToolbarComponent/index.tsx'
    replace(toolbar, 'import { Panel }', f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nimport {{ Panel }}')
    replace(toolbar, 'const FlowToolbar = TRELLIS_EDITOR_PROBE', '''const TrellisBridgeToolbar = () => (
  <Panel className="!m-2 rounded-md border bg-background shadow [&_button]:min-h-11" position="bottom-left">
    <CanvasControlsDropdown selectedNode={null} />
  </Panel>
);
const FlowToolbar = TRELLIS_EDITOR_BRIDGE ? TrellisBridgeToolbar : TRELLIS_EDITOR_PROBE''')
    canvas = 'src/pages/FlowPage/components/PageComponent/index.tsx'
    replace(canvas, 'import { TRELLIS_EDITOR_RESTRICTED }', f'import {{ editorViewportChanged }} from "{native}";\nimport {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\nimport {{ TRELLIS_EDITOR_RESTRICTED }}')
    replace(canvas, '              onInit={setReactFlowInstance}', '              onMoveEnd={TRELLIS_EDITOR_BRIDGE ? editorViewportChanged : undefined}\n              onInit={setReactFlowInstance}')
    replace('src/components/core/parameterRenderComponent/index.tsx',
            '  return renderComponent();', '  return <div data-trellis-node={nodeId} data-trellis-field={name}>{renderComponent()}</div>;')
    restrict_inspectors(replace, mode)
    for module in ['protocol', 'editorOrigin', 'frameDriver', 'session', 'scopedReads', 'editorCatalog', 'editorPalette', 'fieldFocus', 'frontend']:
        for source in sorted((root / module).rglob('*.ts')):
            if source.name.endswith('.test.ts'):
                continue
            target = stage / 'src/customization/trellis' / source.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            content = source.read_text().replace('from "zod"', 'from "zod/v4"')
            if module in ['protocol', 'session']:
                schema = 'flowEditorProtocolV1' if module == 'protocol' else 'flowEditorSessionV1'
                content = content.replace('from "@trellis/api"', f'from "../api/{schema}"')
            assert '@trellis/api' not in content, source
            target.write_text(content)
    for name in schema_names:
        target = stage / f'src/customization/trellis/api/{name}.ts'
        target.parent.mkdir(parents=True, exist_ok=True)
        content = (schemas / f'{name}.ts').read_text().replace('from "zod"', 'from "zod/v4"')
        content = content.replace('from "./flowEditorProtocolV1.ts"', 'from "./flowEditorProtocolV1"')
        target.write_text(content)
    after = {str(path.relative_to(stage)): path.read_text() for path in stage.rglob('*') if path.is_file()}
    patch = []
    for path in sorted(before.keys() | after.keys()):
        old, new = before.get(path, ''), after.get(path, '')
        if old == new:
            continue
        patch.append(f'diff --git a/{path} b/{path}\n')
        if path not in before:
            patch.append('new file mode 100644\n')
        patch.extend(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
                     fromfile=f'a/{path}' if path in before else '/dev/null', tofile=f'b/{path}'))
    output = ''.join(patch).encode()
    patch_path = root / 'patches/production-entry.patch'
    patch_path.write_bytes(output)
    for path in stage.rglob('*'):
        if path.is_file():
            path.unlink()
    for path, content in before.items():
        target = stage / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    subprocess.run(['git', 'apply', '--check', str(patch_path)], cwd=stage, check=True)
    subprocess.run(['git', 'apply', str(patch_path)], cwd=stage, check=True)
    actual = {str(path.relative_to(stage)): path.read_text() for path in stage.rglob('*') if path.is_file()}
    assert actual == after

    (root / 'patches/series.json').write_text(json.dumps({
        'engineCommit': pin,
        'afterProbeSha256': probe_sha,
        'schemaSources': schema_hashes,
        'patch': 'production-entry.patch',
        'sha256': hashlib.sha256(output).hexdigest(),
    }, indent="\t") + '\n')
print('Wrote the production entry patch and its source manifest.')

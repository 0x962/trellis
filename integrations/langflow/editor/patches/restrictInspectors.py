parameter = 'src/components/core/parameterRenderComponent/'
toolbar = 'src/pages/FlowPage/components/nodeToolbarComponent/'
paths = {
    parameter + 'components/strRenderComponent/index.tsx',
    parameter + 'components/tableComponent/components/tableAdvancedToggleCellRender/index.tsx',
    'src/CustomNodes/hooks/use-fetch-data-on-mount.ts',
    'src/CustomNodes/hooks/use-handle-new-value.ts',
    toolbar + 'index.tsx',
    toolbar + 'components/ToolbarButtonRow.tsx',
    toolbar + 'components/ToolbarMoreMenu.tsx',
    toolbar + 'hooks/use-shortcuts.ts',
}


def restrict_inspectors(replace, mode):
    def imports(path, first):
        replace(path, first, f'import {{ TRELLIS_EDITOR_BRIDGE }} from "{mode}";\n{first}')

    main = parameter + 'index.tsx'
    imports(main, 'import { useTranslation }')
    replace(main, 'import { useTranslation }', 'import { DeclaredField } from "@/customization/trellis/frontend/DeclaredField";\nimport useFlowStore from "@/stores/flowStore";\nimport { useTranslation }')
    replace(main, '  const { t } = useTranslation();', '  const { t } = useTranslation();\n  const graph = useFlowStore((state) => state.currentFlow?.data);')
    replace(main, '  return <div data-trellis-node={nodeId} data-trellis-field={name}>{renderComponent()}</div>;', '''  if (TRELLIS_EDITOR_BRIDGE) return showParameter ? (
    <DeclaredField name={name} nodeId={nodeId} field={templateData} value={templateValue}
      disabled={disabled} sourceBound={Boolean(graph && "trellisSource" in graph)}
      onChange={(value) => (handleOnNewValue as handleOnNewValueType)({ value })} />
  ) : null;
  return <div data-trellis-node={nodeId} data-trellis-field={name}>{renderComponent()}</div>;''')
    replace(main, '      disabled,', '      disabled: disabled || (TRELLIS_EDITOR_BRIDGE && name === "code"),')
    replace(main, 'hasRefreshButton: templateData.refresh_button,',
            'hasRefreshButton: !TRELLIS_EDITOR_BRIDGE && templateData.refresh_button,')

    strings = parameter + 'components/strRenderComponent/index.tsx'
    imports(strings, 'import type { InputProps')
    replace(strings, 'import InputGlobalComponent', 'import InputComponent from "../inputComponent";\nimport InputGlobalComponent')
    replace(strings, '    return (\n      <InputGlobalComponent', '''    if (TRELLIS_EDITOR_BRIDGE) {
      return baseInputProps.showParameter ? (
        <InputComponent
          id={`input-${name}`}
          nodeId={nodeId}
          nodeStyle
          editNode={baseInputProps.editNode}
          disabled={baseInputProps.disabled || templateData.load_from_db === true}
          password={templateData.password}
          placeholder={placeholder}
          value={baseInputProps.value}
          onChange={(value, skipSnapshot) => handleOnNewValue({ value }, { skipSnapshot })}
          ariaLabelledBy={baseInputProps.ariaLabelledBy}
        />
      ) : null;
    }
    return (
      <InputGlobalComponent''')
    replace(strings, 'hasRefreshButton={templateData.refresh_button}',
            'hasRefreshButton={!TRELLIS_EDITOR_BRIDGE && templateData.refresh_button}')

    toggle = parameter + 'components/tableComponent/components/tableAdvancedToggleCellRender/index.tsx'
    imports(toggle, 'import type { CustomCellRendererProps }')
    replace(toggle, 'disabled={disabled}', 'disabled={disabled || (TRELLIS_EDITOR_BRIDGE && isTweaks)}')

    fetch = 'src/CustomNodes/hooks/use-fetch-data-on-mount.ts'
    imports(fetch, 'import type { UseMutationResult }')
    replace(fetch, '    async function fetchData() {', '    async function fetchData() {\n      if (TRELLIS_EDITOR_BRIDGE) return;')
    value = 'src/CustomNodes/hooks/use-handle-new-value.ts'
    imports(value, 'import { useUpdateNodeInternals }')
    replace(value, 'const shouldUpdate = parameter.real_time_refresh;',
            'const shouldUpdate = !TRELLIS_EDITOR_BRIDGE && parameter.real_time_refresh;')

    row = toolbar + 'components/ToolbarButtonRow.tsx'
    imports(row, 'import { useTranslation }')
    for condition in ['canEditCode', '!hasToolMode', 'hasToolMode']:
        replace(row, '{' + condition + ' && (', '{!TRELLIS_EDITOR_BRIDGE && ' + condition + ' && (')
    menu = toolbar + 'components/ToolbarMoreMenu.tsx'
    imports(menu, 'import { useTranslation }')
    for action in ['save', 'update']:
        replace(menu, f'<SelectItem variant="plain" value={{"{action}"}}>',
                f'<SelectItem variant="plain" value={{"{action}"}} disabled={{TRELLIS_EDITOR_BRIDGE}}>')
    replace(menu, 'disabled={!hasApiKey || !validApiKey}', 'disabled={TRELLIS_EDITOR_BRIDGE || !hasApiKey || !validApiKey}')
    replace(menu, 'value="freezeAll"', 'value="freezeAll"\n            disabled={TRELLIS_EDITOR_BRIDGE}')

    shortcuts = toolbar + 'hooks/use-shortcuts.ts'
    imports(shortcuts, 'import { useHotkeys }')
    for handler in ['handleFreezeAll', 'handleSaveWShortcut', 'handleCodeWShortcut', 'handleShareWShortcut']:
        replace(shortcuts, f'function {handler}(e: KeyboardEvent) {{',
                f'function {handler}(e: KeyboardEvent) {{\n    if (TRELLIS_EDITOR_BRIDGE) return;')
    replace(shortcuts, '    if (!hasToolMode) return;', '    if (TRELLIS_EDITOR_BRIDGE || !hasToolMode) return;')

    node = toolbar + 'index.tsx'
    imports(node, 'import { useUpdateNodeInternals }')
    replace(node, '      (event: string) => {\n        setSelectedValue(event);',
            '''      (event: string) => {
        if (TRELLIS_EDITOR_BRIDGE && ["save", "saveAll", "override", "code", "update", "Share", "freezeAll", "toolMode"].includes(event)) return;
        setSelectedValue(event);''')

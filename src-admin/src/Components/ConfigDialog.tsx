import React, { useEffect, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import ReactMarkdown, { type Components } from 'react-markdown';
import Form from '@rjsf/mui';
import type CoreForm from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { RJSFValidationError } from '@rjsf/utils';

import {
    Backdrop,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Check as CheckIcon,
    Close as CloseIcon,
    Code as CodeIcon,
    HelpOutlineOutlined as ReadmeIcon,
    ListAlt as FormIcon,
} from '@mui/icons-material';

import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-clouds_midnight';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/ext-language_tools';

import { I18n, type ThemeType } from '@iobroker/gui-components';

import { TabCache } from '../TabCache';
import type { PluginConfig, PluginConfigSchema, PluginType, TabCacheData, WrapperConfig } from '../types';

export interface ConfigDialogResult {
    save: boolean;
    wrapperConfig: WrapperConfig;
    cache: TabCacheData;
}

interface ConfigDialogProps {
    moduleName: string;
    isNew: boolean;
    readme?: string;
    wrapperConfig: WrapperConfig;
    cache: TabCacheData;
    onClose: (result: ConfigDialogResult) => void;
    themeType: ThemeType;
}

interface ConfigChoice {
    platforms: PluginConfig[];
    accessories: PluginConfig[];
}

/** ms to wait for config.schema.json */
const SCHEMA_TIMEOUT = 10000;

// list of all modules whose schema could not be fetched, so we don't fetch again from the remote server (only kept in memory)
const skipFetchModules: string[] = [];

const markdownComponents: Components = {
    a: ({ node: _node, ...props }) => (
        <a
            {...props}
            target="_blank"
            rel="noreferrer"
        />
    ),
};

// remove all errors that come from the schema definitions
const transformErrors = (errors: RJSFValidationError[]): RJSFValidationError[] =>
    errors.filter(e => !e.schemaPath || !e.schemaPath.startsWith('#/definitions/'));

export default function ConfigDialog({
    moduleName,
    isNew,
    readme,
    wrapperConfig,
    cache,
    onClose,
    themeType,
}: ConfigDialogProps): React.JSX.Element {
    const tabCache = new TabCache(cache);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(moduleName);
    const [configSchema, setConfigSchema] = useState<PluginConfigSchema | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [config, setConfig] = useState<PluginConfig | undefined>(undefined);
    const [text, setText] = useState('');
    const [inputError, setInputError] = useState<string | undefined>(undefined);

    const [configChoice, setConfigChoice] = useState<ConfigChoice | null>(null);
    const [selectedType, setSelectedType] = useState<PluginType | ''>('');
    const [selectedName, setSelectedName] = useState('');
    const [preview, setPreview] = useState<PluginConfig | PluginConfig[] | ConfigChoice | undefined>(undefined);

    const dialogContentRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<CoreForm>(null);
    const aceTheme = themeType === 'dark' ? 'clouds_midnight' : 'github';

    const handleJsonChange = (newText: string): void => {
        let error: string | undefined;
        try {
            const parsedConfig = JSON.parse(newText) as PluginConfig;
            if (!parsedConfig.platform && !parsedConfig.accessory) {
                throw new Error(`Either the "platform" or "accessory" property must be set`);
            }
            if (parsedConfig.platform && parsedConfig.accessory) {
                throw new Error(`Only either the "platform" or "accessory" property may exist`);
            }
            setConfig(parsedConfig);
        } catch (err) {
            error = (err as Error).message;
        }
        setText(newText);
        setInputError(error);
    };

    /** Opens the dialog in JSON mode */
    const openAsText = (textConfig: unknown): void => {
        setConfigSchema(null);
        setShowForm(false);
        setTitle(moduleName);
        setConfig(undefined);
        setOpen(true);
        setLoading(false);
        handleJsonChange(JSON.stringify(textConfig, null, 4));
    };

    useEffect(() => {
        const load = async (): Promise<void> => {
            try {
                if (skipFetchModules.includes(moduleName)) {
                    throw new Error('Previous error');
                }
                // without a timeout the dialog would wait forever if the CDN is not reachable
                const response = await fetch(
                    `https://cdn.jsdelivr.net/npm/${encodeURI(moduleName)}/config.schema.json`,
                    { signal: AbortSignal.timeout(SCHEMA_TIMEOUT) },
                );
                const schema = (await response.json()) as PluginConfigSchema;
                if (!schema.schema) {
                    throw new Error('Invalid schema found');
                }
                tabCache.set(moduleName, schema.pluginAlias, schema.pluginType);
                setConfigSchema(schema);
                setShowForm(true);
                setTitle(schema.pluginAlias || moduleName);
                setConfig(isNew ? {} : tabCache.findConfig(moduleName, wrapperConfig));
                setOpen(true);
                setLoading(false);
            } catch (err) {
                console.error(err);
                if (!skipFetchModules.includes(moduleName)) {
                    skipFetchModules.push(moduleName);
                }
                if (isNew) {
                    openAsText({});
                } else if (tabCache.exists(moduleName)) {
                    openAsText(tabCache.findConfig(moduleName, wrapperConfig));
                } else {
                    // we don't know which config matches this plugin, let's ask the user
                    const choice: ConfigChoice = {
                        platforms: tabCache.findUnassigned('platform', wrapperConfig),
                        accessories: tabCache.findUnassigned('accessory', wrapperConfig),
                    };
                    setConfigChoice(choice);
                    setPreview(choice);
                    setLoading(false);
                }
            }
        };
        void load();
        // load the schema only once, when the dialog is opened
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!showForm || !configSchema) {
            return;
        }
        // rjsf renders an "unsupported-field" if the schema cannot be handled: switch to the text mode
        const timer = setTimeout(() => {
            if (dialogContentRef.current?.querySelector('.unsupported-field')) {
                console.error('Unsupported schema, switching to text mode');
                openAsText(config || {});
            }
        }, 0);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showForm, configSchema]);

    const handleTypeChange = (type: PluginType): void => {
        if (!configChoice) {
            return;
        }
        const items = configChoice[TabCache.getKind(type)];
        setSelectedType(type);
        setSelectedName('');
        setPreview(items);
    };

    const handleNameChange = (name: string): void => {
        if (!configChoice || !selectedType) {
            return;
        }
        setSelectedName(name);
        setPreview(configChoice[TabCache.getKind(selectedType)].find(c => c[selectedType] === name));
    };

    const handleSelect = (): void => {
        if (!selectedType) {
            return;
        }
        tabCache.set(moduleName, selectedName, selectedType);
        setConfigChoice(null);
        openAsText(preview);
    };

    const handleDisplayMode = (value: string | null): void => {
        if (value === 'form') {
            // config already contains the new value
            setShowForm(true);
        } else if (value === 'text') {
            setShowForm(false);
            handleJsonChange(JSON.stringify(config, null, 4));
        }
    };

    const handleClose = (): void => {
        setOpen(false);
        setConfigChoice(null);
        onClose({ save: false, wrapperConfig, cache });
    };

    const handleSave = (requireValidation: boolean): void => {
        if (showForm && requireValidation) {
            // this triggers onSubmit() if the validation passes
            formRef.current?.submit();
            return;
        }

        setOpen(false);

        if (isNew) {
            let newConfig: PluginConfig;
            let type: PluginType;
            if (showForm && configSchema) {
                newConfig = { ...config, [configSchema.pluginType]: configSchema.pluginAlias };
                type = configSchema.pluginType;
            } else {
                newConfig = JSON.parse(text) as PluginConfig;
                // update the cache (as we now know the type)
                type = TabCache.getType(newConfig);
                tabCache.set(moduleName, newConfig[type] as string, type);
            }
            TabCache.getList(wrapperConfig, type).push(newConfig);
        } else {
            const { configList, configIndex } = tabCache.locateConfig(moduleName, wrapperConfig);
            configList[configIndex] = config || (JSON.parse(text) as PluginConfig);
        }

        onClose({ save: true, wrapperConfig, cache });
    };

    return (
        <>
            <Backdrop
                open={loading}
                sx={{ zIndex: 2000 }}
            >
                <CircularProgress color="inherit" />
            </Backdrop>

            <Dialog
                maxWidth="md"
                fullWidth
                open={!!configChoice}
                onClose={handleClose}
            >
                <DialogTitle>{I18n.t('Select config for %s', moduleName)}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mb: 2 }}>{I18n.t('select_config_note_%s', moduleName)}</Typography>
                    <Grid
                        container
                        spacing={2}
                    >
                        <Grid size={6}>
                            <FormControl
                                fullWidth
                                variant="standard"
                            >
                                <InputLabel>{I18n.t('Type')}</InputLabel>
                                <Select
                                    variant="standard"
                                    value={selectedType}
                                    onChange={e => handleTypeChange(e.target.value)}
                                >
                                    <MenuItem
                                        value="platform"
                                        disabled={!configChoice?.platforms.length}
                                    >
                                        platform
                                    </MenuItem>
                                    <MenuItem
                                        value="accessory"
                                        disabled={!configChoice?.accessories.length}
                                    >
                                        accessory
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={6}>
                            <FormControl
                                fullWidth
                                variant="standard"
                            >
                                <InputLabel>{I18n.t('Name')}</InputLabel>
                                <Select
                                    variant="standard"
                                    value={selectedName}
                                    onChange={e => handleNameChange(e.target.value)}
                                    disabled={!selectedType}
                                >
                                    {(configChoice && selectedType
                                        ? configChoice[TabCache.getKind(selectedType)]
                                              .map(c => c[selectedType] as string)
                                              .filter(n => !!n)
                                        : []
                                    ).map(name => (
                                        <MenuItem
                                            key={name}
                                            value={name}
                                        >
                                            {name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={12}>
                            <InputLabel shrink>{I18n.t('Preview')}</InputLabel>
                            <AceEditor
                                mode="json"
                                theme={aceTheme}
                                name="preview_json"
                                width="100%"
                                height="250px"
                                readOnly
                                value={preview ? JSON.stringify(preview, null, 4) : ''}
                                editorProps={{ $blockScrolling: true }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSelect}
                        disabled={!selectedType || !selectedName}
                        startIcon={<CheckIcon />}
                    >
                        {I18n.t('Select')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={handleClose}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                fullWidth
                maxWidth="md"
                open={open}
                onClose={handleClose}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1 }}>{I18n.t('Configure %s', title)}</Box>
                    <ToggleButtonGroup
                        size="small"
                        value={showForm ? 'form' : 'text'}
                        exclusive
                        onChange={(_e, value: string | null) => handleDisplayMode(value)}
                    >
                        <ToggleButton value="text">
                            <Tooltip title={I18n.t('JSON Source')}>
                                <CodeIcon fontSize="small" />
                            </Tooltip>
                        </ToggleButton>
                        <ToggleButton
                            value="form"
                            disabled={!configSchema || !!inputError}
                        >
                            <Tooltip title={I18n.t('Form')}>
                                <FormIcon fontSize="small" />
                            </Tooltip>
                        </ToggleButton>
                    </ToggleButtonGroup>
                    {readme ? (
                        <Tooltip title={I18n.t('Readme')}>
                            <IconButton
                                size="small"
                                href={readme}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <ReadmeIcon />
                            </IconButton>
                        </Tooltip>
                    ) : null}
                </DialogTitle>
                <DialogContent
                    ref={dialogContentRef}
                    dividers
                >
                    {configSchema?.headerDisplay ? (
                        <Typography component="div">
                            <ReactMarkdown components={markdownComponents}>{configSchema.headerDisplay}</ReactMarkdown>
                        </Typography>
                    ) : null}
                    {showForm && configSchema ? (
                        <Box sx={{ minHeight: 550 }}>
                            <Form
                                ref={formRef}
                                schema={configSchema.schema}
                                formData={config || {}}
                                validator={validator}
                                uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
                                onChange={({ formData }) => setConfig(formData as PluginConfig)}
                                onSubmit={() => handleSave(false)}
                                onError={() => dialogContentRef.current?.scrollTo(0, 0)}
                                transformErrors={transformErrors}
                            />
                        </Box>
                    ) : null}
                    {!showForm ? (
                        <AceEditor
                            mode="json"
                            onChange={handleJsonChange}
                            name="edit_json"
                            width="100%"
                            height="550px"
                            theme={aceTheme}
                            value={text}
                            editorProps={{ $blockScrolling: true }}
                            setOptions={{
                                enableBasicAutocompletion: true,
                                enableLiveAutocompletion: true,
                            }}
                        />
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Box sx={{ flex: 1, pl: 2 }}>
                        {inputError ? (
                            <Typography color="error">{inputError}</Typography>
                        ) : configSchema?.footerDisplay ? (
                            <Typography component="div">
                                <ReactMarkdown components={markdownComponents}>
                                    {configSchema.footerDisplay.replace(/<i class=[^<]+<\/i>/, '')}
                                </ReactMarkdown>
                            </Typography>
                        ) : null}
                    </Box>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => handleSave(true)}
                        disabled={!!inputError}
                        startIcon={<CheckIcon />}
                    >
                        {I18n.t('Save')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={handleClose}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

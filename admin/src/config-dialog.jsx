import I18n from '@iobroker/adapter-react/i18n';
import Backdrop from '@material-ui/core/Backdrop';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import Code from '@material-ui/icons/Code';
import HelpOutline from '@material-ui/icons/HelpOutline';
import ListAlt from '@material-ui/icons/ListAlt';
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup';
import Form from '@rjsf/material-ui';
import React, { Fragment, useEffect, useReducer, useRef } from 'react';
import AceEditor from 'react-ace';
import ReactMarkdown from 'react-markdown';
import { TabCache } from './tab-cache';
import TooltipButton from './tooltip-button';

import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';

ace.config.set(
    "basePath", 
    "/lib/js/ace-1.2.0/" // if this doesn't work, we could also use jsdelivr "https://cdn.jsdelivr.net/npm/ace-builds@1.4.12/src-noconflict/"
);

const initialState = {
    loading: false,
    open: false,
    title: '',
    configSchema: undefined,
    showForm: false,
    lastQuery: undefined,
    configChoice: undefined,
    selectedType: '',
    availableNames: [],
    selectedName: '',
    config: undefined,
    text: undefined,
    inputError: undefined,
};

function reducer(state, { type, payload }) {
    switch (type) {
        case 'FETCH_INIT':
            return {
                ...state,
                loading: true,
            };
        case 'UPDATE_QUERY':
            return {
                ...state,
                lastQuery: payload,
            };
        case 'CHOOSE_CONFIG':
            return {
                ...state,
                loading: false,
                selectedType: '',
                availableNames: [],
                selectedName: '',
                configChoice: payload.choice,
                config: payload.config,
            };
        case 'UPDATE_CONFIG_CHOICE':
            return {
                ...state,
                ...payload,
            };
        case 'OPEN_DIALOG':
            return {
                ...state,
                ...payload,
                loading: false,
                open: true,
                configChoice: undefined,
            };
        case 'CLOSE_DIALOG':
            return {
                ...state,
                configChoice: undefined,
                config: undefined,
                text: undefined,
                inputError: undefined,
                loading: false,
                open: false,
            };
        case 'CONFIG_CHANGE':
            return {
                ...state,
                config: payload,
            };
        case 'TEXT_CHANGE':
            return {
                ...state,
                text: payload.text,
                inputError: payload.error,
            };
        case 'SWITCH_DISPLAY_MODE':
            return {
                ...state,
                showForm: payload,
            };
        default:
            return state;
    }
}

// list of all modules that schema fetch failed, so we don't fetch again from the remote server (only keep this in local memory)
const skipFetchModules = [];

export default ({ moduleName, isNew, readme, wrapperConfig, cache, onClose }) => {
    const [state, dispatch] = useReducer(reducer, { ...initialState, wrapperConfig: wrapperConfig });
    const tabCache = new TabCache(cache);

    const loadData = () => {
        const { lastQuery, loading } = state;

        const query = `https://cdn.jsdelivr.net/npm/${encodeURI(moduleName)}/config.schema.json`;
        if (query !== lastQuery && !loading) {
            if (moduleName) {
                dispatch({ type: 'FETCH_INIT' });
                const promise = skipFetchModules.includes(moduleName) ? Promise.reject('Previous error') : fetch(query);
                promise
                    .then((response) => response.json())
                    .then((configSchema) => {
                        if (!configSchema.schema) {
                            throw new Error('Invalid schema found');
                        }
                        tabCache.set(moduleName, configSchema.pluginAlias, configSchema.pluginType);
                        let config = isNew ? {} : tabCache.findConfig(moduleName, wrapperConfig);
                        dispatch({
                            type: 'OPEN_DIALOG',
                            payload: {
                                configSchema: configSchema,
                                showForm: true,
                                title: configSchema.pluginAlias || moduleName,
                                config: config,
                                text: undefined,
                            },
                        });
                    })
                    .catch((err) => {
                        console.error(err);
                        if (!skipFetchModules.includes(moduleName)) {
                            skipFetchModules.push(moduleName);
                        }
                        if (isNew) {
                            dispatch({
                                type: 'OPEN_DIALOG',
                                payload: {
                                    configSchema: undefined,
                                    showForm: false,
                                    title: moduleName,
                                    config: undefined,
                                },
                            });
                            handleJsonChange(JSON.stringify({}, null, 4));
                        } else if (tabCache.exists(moduleName)) {
                            const config = tabCache.findConfig(moduleName, wrapperConfig);
                            dispatch({
                                type: 'OPEN_DIALOG',
                                payload: {
                                    configSchema: undefined,
                                    showForm: false,
                                    title: moduleName,
                                    config: undefined,
                                },
                            });
                            handleJsonChange(JSON.stringify(config, null, 4));
                        } else {
                            // we don't know which config matches this plugin, let's ask the user
                            const choice = {
                                platforms: tabCache.findUnassigned('platform', wrapperConfig),
                                accessories: tabCache.findUnassigned('accessory', wrapperConfig),
                            };
                            dispatch({
                                type: 'CHOOSE_CONFIG',
                                payload: {
                                    choice,
                                    config: choice,
                                }
                            });
                        }
                    });
            }
            dispatch({ type: 'UPDATE_QUERY', payload: query });
        }
    };

    useEffect(() => loadData());

    const dialogContentRef = useRef();
    const formRef = useRef();

    const handleTypeChange = ({ target }) => {
        const { configChoice } = state;
        const items = target.value === 'platform' ? 'platforms' : 'accessories';
        dispatch({
            type: 'UPDATE_CONFIG_CHOICE',
            payload: {
                selectedType: target.value,
                availableNames: configChoice[items].map(c => c[target.value]).filter(n => !!n),
                selectedName: '',
                config: configChoice[items],
            },
        });
    }

    const handleNameChange = ({ target }) => {
        const { configChoice, selectedType } = state;
        const items = selectedType === 'platform' ? 'platforms' : 'accessories';
        dispatch({
            type: 'UPDATE_CONFIG_CHOICE',
            payload: {
                selectedName: target.value,
                config: configChoice[items].find(c => c[selectedType] === target.value),
            },
        });
    }

    const handleSelect = () => {
        const { config, selectedType, selectedName } = state;
        tabCache.set(moduleName, selectedName, selectedType);
        dispatch({
            type: 'OPEN_DIALOG',
            payload: {
                configSchema: undefined,
                showForm: false,
                title: moduleName,
                config: undefined,
            },
        });
        handleJsonChange(JSON.stringify(config, null, 4));
    };

    const handleDisplayMode = (_event, value) => {
        const { config, text } = state;
        switch (value) {
            case 'text':
                dispatch({
                    type: 'SWITCH_DISPLAY_MODE',
                    payload: false,
                });
                handleJsonChange(JSON.stringify(config, null, 4));
                break;
            case 'form':
                dispatch({
                    type: 'SWITCH_DISPLAY_MODE',
                    payload: true,
                });
                // config will already contain the new value
                break;
        }
    };

    const handleFormChange = ({ formData }) => {
        dispatch({
            type: 'CONFIG_CHANGE',
            payload: formData,
        });
    };

    const handleFormError = () => {
        dialogContentRef.current.scrollTo(0, 0);
    };

    const transformErrors = (errors) => {
        // remove all errors that come from the schema definitions
        return errors.filter(e => !e.schemaPath || !e.schemaPath.startsWith('#/definitions/'));
    }

    const handleJsonChange = (value) => {
        let error = undefined;
        try {
            const parsedConfig = JSON.parse(value);
            if (!parsedConfig.platform && !parsedConfig.accessory) {
                throw new Error(`Either the "platform" or "accessory" property must be set`);
            }
            if (parsedConfig.platform && parsedConfig.accessory) {
                throw new Error(`Only either the "platform" or "accessory" property may exist`);
            }
            dispatch({
                type: 'CONFIG_CHANGE',
                payload: parsedConfig,
            });
        } catch (err) {
            error = err.message;
        }
        dispatch({
            type: 'TEXT_CHANGE',
            payload: { text: value, error: error },
        });
    };

    const handleClose = () => {
        dispatch({ type: 'CLOSE_DIALOG' });
        onClose({ save: false, wrapperConfig, cache });
    };

    const handleSave = (requireValidation) => {
        const { config, text, configSchema, showForm } = state;
        if (showForm && requireValidation) {
            // this will trigger onSubmit() if validation passes
            console.log(formRef);
            formRef.current.submit();
            return;
        }

        dispatch({ type: 'CLOSE_DIALOG' });
        if (isNew) {
            let newConfig;
            let kind;
            if (showForm) {
                newConfig = { ...config, [configSchema.pluginType]: configSchema.pluginAlias };
                kind = tabCache.getKind(configSchema.pluginType);
            } else {
                newConfig = JSON.parse(text);
                // update cache (as we now know the type)
                const type = tabCache.getType(newConfig);
                tabCache.set(moduleName, newConfig[type], type);
                kind = tabCache.getKind(type);
            }
            
            wrapperConfig[kind].push(newConfig);
        } else {
            const { configList, configIndex } = tabCache.locateConfig(moduleName, wrapperConfig);
            configList[configIndex] = config || JSON.parse(text);
        }
        onClose({ save: true, wrapperConfig, cache });
    };

    const { loading, open, title, configSchema, showForm, configChoice, selectedType, availableNames, selectedName, text, config, inputError } = state;
    
    useEffect(() => {
        setTimeout(() => {
            // very hacky way to figure out whether we couldn't read the schema at all
            if (configSchema && formRef.current && formRef.current.formElement) {
                const root = formRef.current.formElement;
                if (root && root.firstChild && root.firstChild.firstChild && root.firstChild.firstChild.className === 'unsupported-field') {
                    const { config } = state;
                    console.error('Unsupported schema, switching to text mode');
                    dispatch({
                        type: 'OPEN_DIALOG',
                        payload: {
                            configSchema: undefined,
                            showForm: false,
                            title: moduleName,
                            config: undefined,
                        },
                    });
                    handleJsonChange(JSON.stringify(config || {}, null, 4));
                }
            }
        }, 0);
    }, [configSchema]);

    return (
        <>
            <Backdrop open={loading} style={{ zIndex: 2000 }}>
                <CircularProgress color="inherit" />
            </Backdrop>
            <Dialog aria-labelledby="choice-dialog-title" maxWidth="md" open={!!configChoice}>
                <DialogTitle id="choice-dialog-title">{I18n.t('Select config for %s', moduleName)}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Typography component="div">{I18n.t('select_config_note_%s', moduleName)}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl style={{width: '100%'}}>
                                <InputLabel id="type-label">{I18n.t('Type')}</InputLabel>
                                <Select
                                    labelId="type-label"
                                    id="type-select"
                                    value={selectedType}
                                    onChange={handleTypeChange}>
                                    <MenuItem value="platform" disabled={!configChoice || !configChoice.platforms.length}>platform</MenuItem>
                                    <MenuItem value="accessory" disabled={!configChoice || !configChoice.accessories.length}>accessory</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl style={{width: '100%'}}>
                                <InputLabel id="name-label">{I18n.t('Name')}</InputLabel>
                                <Select
                                    labelId="name-label"
                                    id="name-select"
                                    value={selectedName}
                                    onChange={handleNameChange}
                                    disabled={!selectedType}>
                                    {availableNames.map(name => (<MenuItem key={name} value={name}>{name}</MenuItem>))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <InputLabel id="name-label">{I18n.t('Preview')}</InputLabel>
                        </Grid>
                    </Grid>
                    <Grid container spacing={1} style={{ marginBottom: '8px' }}>
                        <Grid item xs={12}>
                            <AceEditor
                                mode="json"
                                theme="github"
                                onChange={handleJsonChange}
                                name="preview_json"
                                width="100%"
                                height="250px"
                                readOnly
                                value={config ? JSON.stringify(config, null, 4) : ''}
                                editorProps={{ $blockScrolling: true }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <div style={{ flex: '1 0 0' }} />
                    <Button color="primary" onClick={handleClose}>
                        {I18n.t('Cancel')}
                    </Button>
                    <Button color="primary" onClick={handleSelect} disabled={!selectedType || !selectedName}>
                        {I18n.t('Select')}
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog aria-labelledby="form-dialog-title" fullWidth={true} maxWidth="md" open={open}>
                <DialogTitle id="form-dialog-title">
                    {I18n.t('Configure %s', title)}
                    <ToggleButtonGroup
                        size="small"
                        style={{ float: 'right' }}
                        value={(showForm ? 'form' : 'text')}
                        exclusive
                        onChange={handleDisplayMode}>
                        <TooltipButton toggle={true} tooltip={I18n.t('JSON Source')} Icon={Code} value="text" />
                        <TooltipButton toggle={true} tooltip={I18n.t('Form')} Icon={ListAlt} value="form" disabled={!configSchema || inputError} />
                        <TooltipButton toggle={true} tooltip={I18n.t('Readme')} Icon={HelpOutline} value="readme" target="_blank" href={readme} />
                    </ToggleButtonGroup>
                </DialogTitle>
                <DialogContent ref={dialogContentRef}>
                    {configSchema && configSchema.headerDisplay && (
                        <Typography component="div">
                            <ReactMarkdown linkTarget="_blank">{configSchema.headerDisplay}</ReactMarkdown>
                        </Typography>
                    )}
                    {showForm && (
                        <div style={{height:'550px'}}>
                            <Form
                                schema={configSchema.schema}
                                formData={(config || {})}
                                onChange={handleFormChange}
                                onSubmit={() => handleSave(false)}
                                onError={handleFormError}
                                transformErrors={transformErrors}
                                ref={formRef}
                            >
                                <Fragment />
                            </Form>
                        </div>
                    )}
                    {!showForm && (
                        <AceEditor
                            mode="json"
                            theme="github"
                            onChange={handleJsonChange}
                            name="edit_json"
                            width="100%"
                            height="550px"
                            value={text}
                            editorProps={{ $blockScrolling: true }}
                            setOptions={{
                                enableBasicAutocompletion: true,
                                enableLiveAutocompletion: true,
                                enableSnippets: true
                            }}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Typography component="div" style={{ paddingLeft: '16px' }}>
                        {!inputError && (<ReactMarkdown linkTarget="_blank">{configSchema && configSchema.footerDisplay}</ReactMarkdown>)}
                        {inputError && (<Typography style={{ color: 'red' }}>{ inputError }</Typography>)}
                    </Typography>
                    <div style={{ flex: '1 0 0' }} />
                    <Button color="primary" onClick={handleClose}>
                        {I18n.t('Cancel')}
                    </Button>
                    <Button color="primary" onClick={() => handleSave(true)} disabled={!!inputError}>
                        {I18n.t('Save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

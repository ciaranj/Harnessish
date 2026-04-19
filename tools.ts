export const toolsDefinition: any[] = [
        {
            "type":"function",
            "function":{
                "name":"read_from_file",
                "description":"Read the contents of a file and return it to the context",
                "parameters": {
                    "type":"object",
                    "properties": {
                        "path": {
                            "type":"string",
                            "description":"The path to the file that needs reading"
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_to_file",
                "description": "Creates a new file or overwrites an existing file with the provided content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to write."
                        },
                        "content": {
                            "type": "string",
                            "description": "The full content to write into the file."
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "append_to_file",
                "description": "Appends content to the end of an existing file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to append to."
                        },
                        "content": {
                            "type": "string",
                            "description": "The content to append."
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "replace_content",
                "description": "Replaces a specific block of text in a file with new content. This is more reliable than using line numbers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to edit."
                        },
                        "search_string": {
                            "type": "string",
                            "description": "The exact code snippet/block to find and replace."
                        },
                        "replacement_string": {
                            "type": "string",
                            "description": "The new code snippet/block to insert."
                        }
                    },
                    "required": ["path", "search_string", "replacement_string"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_git_diff",
                "description": "Returns the differences between the current working directory and the last commit. Use this to see exactly what code has changed to write accurate commit messages.",
                "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                    "type": "string",
                    "description": "The specific file to check the diff for. If omitted, returns diffs for all changed files."
                    },
                    "staged": {
                    "type": "boolean",
                    "description": "If true, returns the diff of files already added to the git index (staged). If false, returns unstaged changes."
                    }
                }
                }
            }
        },
        {
        "type":"function",
        "function":{
            "name":"python",
            "description":"Runs code in an ipython interpreter and returns the result of the execution after 60 seconds.",
            "parameters":{
            "type":"object",
            "properties":{
                "code":{
                "type":"string",
                "description":"The code to run in the ipython interpreter."
                }
            },
            "required":["code"]
            }
        }
        }
        ,
        {
            "type": "function",
            "function": {
                "name": "search_web",
                "description": "Search the web using SearXNG to get up-to-date information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query"
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "fetch_url",
                "description": "Fetches the content of a URL and returns it as text.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The URL to fetch."
                        }
                    },
                    "required": ["url"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "Lists the files and directories in a given path.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The directory path to list."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_file_tree",
                "description": "Returns a recursive directory tree structure of a path.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The root path to generate the tree from."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_code",
                "description": "Search for a pattern in the codebase using grep. Returns line numbers and file paths.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "The regex pattern or string to search for."
                        },
                        "path": {
                            "type": "string",
                            "description": "The directory or file to search in (defaults to current directory)."
                        }
                    },
                    "required": ["pattern"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "grep_file",
                "description": "Search for a pattern within a specific file. Returns the line numbers and the content of the matching lines.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to search in."
                        },
                        "pattern": {
                            "type": "string",
                            "description": "The regex pattern or string to search for."
                        }
                    },
                    "required": ["path", "pattern"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_file",
                "description": "Finds files by name or pattern within a directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "The filename or pattern to search for (e.g., 'utils.ts' or '*.test.ts')."
                        },
                        "path": {
                            "type": "string",
                            "description": "The directory to start the search from. Defaults to the current directory."
                        }
                    },
                    "required": ["pattern"]
                }
            }
        }
];

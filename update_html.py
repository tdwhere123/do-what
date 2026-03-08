import re

with open('UI/do-what-ui-preview.html', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Fonts and Title
text = text.replace('<title>do-what UI Preview - Pi-pa</title>', '<title>do-what UI Preview - Jin-xiang-yu</title>')
text = text.replace('family=Caveat:wght@400..700&family=Special+Elite', 'family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700')

# 2. Colors
old_colors = """            /* Pi-pa (琵琶) Palette - Light Mode */
            --bg: #E9DCD1;
            --surface: #F8F2ED;
            --surface-raised: #FFFFFF;
            --border: rgba(65, 53, 32, 0.12);
            --border-strong: rgba(65, 53, 32, 0.2);
            --text-primary: #413520;
            --text-secondary: #615020;
            --text-muted: rgba(65, 53, 32, 0.5);

            --accent-primary: #615020;
            --accent-primary-light: rgba(97, 80, 32, 0.6);
            --accent-warm: #615020;
            --accent-warm-light: #E9DDD5;
            --accent-gold: #413520;

            --status-running: #615020;
            --status-success: #615020;
            --status-waiting: rgba(97, 80, 32, 0.6);
            --status-error: #413520;

            --soul-working: rgba(97, 80, 32, 0.2);
            --soul-consolidated: rgba(97, 80, 32, 0.6);
            --soul-canon: #615020;

            --font-display: 'Caveat', cursive;
            --font-ui: 'Special Elite', 'Inter', system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;"""

new_colors = """            /* Jin-xiang-yu (金镶玉) Palette - Light Mode */
            --bg: #F8F3E6;
            --surface: #FBF7ED;
            --surface-raised: #FFFFFF;
            --border: rgba(90, 74, 56, 0.12);
            --border-strong: rgba(90, 74, 56, 0.2);
            --text-primary: #5A4A38;
            --text-secondary: #8C7861;
            --text-muted: rgba(90, 74, 56, 0.5);

            --accent-primary: #C6A75C;
            --accent-primary-light: rgba(198, 167, 92, 0.6);
            --accent-warm: #C6A75C;
            --accent-warm-light: #EEE5CC;
            --accent-gold: #C6A75C;

            --status-running: #C6A75C;
            --status-success: #C6A75C;
            --status-waiting: rgba(198, 167, 92, 0.6);
            --status-error: #5A4A38;

            --soul-working: rgba(198, 167, 92, 0.2);
            --soul-consolidated: rgba(198, 167, 92, 0.6);
            --soul-canon: #C6A75C;

            --font-display: 'Courier Prime', monospace;
            --font-ui: 'Courier Prime', 'Inter', system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;"""
text = text.replace(old_colors, new_colors)

# 3. Soul CSS
old_soul_css = """        /* Soul Side Channel */
        .soul-channel {
            position: absolute;
            left: -24px;
            top: 2px;
            width: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
        }

        .soul-icon {
            width: 14px;
            height: 14px;
            fill: currentColor;
        }

        .soul-working {
            color: var(--accent-primary);
            opacity: 0.2;
        }

        .soul-consolidated {
            color: var(--accent-primary);
            opacity: 0.6;
        }

        .soul-canon {
            color: var(--accent-warm);
            opacity: 1;
        }

        .soul-tooltip {
            position: absolute;
            left: 16px;
            top: 0;
            background: var(--surface-raised);
            border: 1px solid var(--border-strong);
            padding: 8px 12px;
            border-radius: 6px;
            font-family: var(--font-mono);
            font-size: 11px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            width: max-content;
            z-index: 100;
            color: var(--text-secondary);
            display: none;
            white-space: pre-wrap;
            line-height: 1.5;
        }

        .soul-channel:hover .soul-tooltip {
            display: block;
        }"""
new_soul_css = """        /* Soul Side Channel */
        .soul-channel {
            position: absolute;
            left: -24px;
            top: 8px;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 16px;
            height: 16px;
        }

        .soul-dot {
            width: 6px;
            height: 6px;
            background: var(--accent-primary);
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 0 2px var(--bg);
            opacity: 0.6;
            transition: transform 0.2s, opacity 0.2s;
        }

        .soul-channel:hover .soul-dot {
            transform: scale(1.5);
            opacity: 1;
        }

        .soul-popup {
            position: absolute;
            left: 20px;
            top: -4px;
            background: var(--surface-raised);
            border: 1px solid var(--border-strong);
            padding: 8px 12px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            display: none;
            flex-direction: row;
            gap: 8px;
            align-items: center;
            z-index: 100;
            white-space: nowrap;
        }

        .soul-channel:hover .soul-popup {
            display: flex;
        }

        .soul-icon {
            width: 14px;
            height: 14px;
            fill: currentColor;
        }

        .soul-working {
            color: var(--accent-primary);
            opacity: 0.2;
        }

        .soul-consolidated {
            color: var(--accent-primary);
            opacity: 0.6;
        }

        .soul-canon {
            color: var(--accent-gold);
            opacity: 1;
        }

        .soul-tooltip {
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-secondary);
        }"""
text = text.replace(old_soul_css, new_soul_css)

# Remove old status bar from CSS
text = text.replace("""
        /* StatusBar */
        .statusbar {
            height: 32px;
            background: var(--accent-primary);
            color: #F8F2ED;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 16px;
            font-size: 11px;
            font-weight: 600;
            gap: 40px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .dot-green {
            width: 6px;
            height: 6px;
            background: #4D7039;
            border-radius: 50%;
        }""", "")

# Replace header (remove + New Run)
old_header = """            <button class="btn-primary">+ New Run</button>
            <button class="btn-ghost" style="margin-left:8px;">⚙ Settings</button>"""
new_header = """            <button class="btn-ghost" style="margin-left:8px;">⚙ Settings</button>"""
text = text.replace(old_header, new_header)

# Status bar inside sidebar component
sidebar_footer = """                <div style="margin-top: auto; border-top: 1px solid var(--border); padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 11px; font-weight:600; font-family:var(--font-mono); color: var(--text-secondary);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <svg viewBox="0 0 300 300" style="width:14px; height:14px; fill:currentColor;"><use href="#svg-flower"></use></svg>
                        <span style="flex:1;">Core</span>
                        <span style="color:var(--status-success);">Online</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <svg viewBox="0 0 300 300" style="width:16px; height:16px; fill:currentColor; margin-left:-1px;"><use href="#svg-smile"></use></svg>
                        <span style="flex:1;">Engine</span>
                        <span style="color:var(--status-success);">Online</span>
                    </div>
                </div>"""

# Replace Sidebar 1
old_sidebar_1 = """                            <div class="session-item">
                                <div class="status-dot" style="background: var(--status-success)"></div>
                                <span class="run-desc">Setup Claude Code</span>
                            </div>
                        </div>

                        <div class="ws-item" style="margin-top:8px;">
                            <span>/project-alpha</span>
                            <span style="font-size:11px; color:var(--text-muted);">▶</span>
                        </div>

                    </div>
                </div>
            </div>"""
new_sidebar_1 = """                            <div class="session-item">
                                <div class="status-dot" style="background: var(--status-success)"></div>
                                <span class="run-desc">Setup Claude Code</span>
                            </div>
                            <div class="session-item" style="color:var(--accent-primary); margin-top:4px; font-weight:600; padding: 4px 10px; cursor:pointer;">
                                + New Run
                            </div>
                        </div>

                        <div class="ws-item" style="margin-top:8px;">
                            <span>/project-alpha</span>
                            <span style="font-size:11px; color:var(--text-muted);">▶</span>
                        </div>

                    </div>
                </div>

""" + sidebar_footer + """
            </div>"""
text = text.replace(old_sidebar_1, new_sidebar_1)

# Replace Soul Channel Html
old_soul_html = """                        <!-- Soul Context Side Channel -->
                        <div class="soul-channel">
                            <svg class="soul-icon soul-canon">
                                <use href="#svg-flower"></use>
                            </svg>
                            <svg class="soul-icon soul-consolidated">
                                <use href="#svg-flower"></use>
                            </svg>
                            <div class="soul-tooltip">
                                <span style="color:var(--accent-warm)">[Canon] color-palette-preferences</span><br>
                                User prefers Cowork style (#1A5F7A, #F4A261). Light backgrounds over heavy earth
                                tones.<br><br>
                                <span style="color:var(--text-secondary)">[Consolidated] ui-layout</span><br>
                                Sidebar should represent Workspaces structurally.
                            </div>
                        </div>"""

new_soul_html = """                        <!-- Soul Context Side Channel -->
                        <div class="soul-channel">
                            <div class="soul-dot"></div>
                            <div class="soul-popup">
                                <svg class="soul-icon soul-canon">
                                    <use href="#svg-flower"></use>
                                </svg>
                                <svg class="soul-icon soul-consolidated">
                                    <use href="#svg-flower"></use>
                                </svg>
                                <div class="soul-tooltip">
                                    <span style="color:var(--accent-warm)">[Canon] color-preferences</span><br>
                                    User prefers Jin-xiang-yu.
                                </div>
                            </div>
                        </div>"""
text = text.replace(old_soul_html, new_soul_html)

# Remove Old Statusbar block inside app-window
old_bottom_statusbar = """        <!-- StatusBar -->
        <div class="statusbar">
            <div class="status-item">
                <svg viewBox="0 0 300 300" style="width:14px; height:14px; fill:currentColor;"><use href="#svg-flower"></use></svg>
                <span>Core</span>
                <span style="opacity: 0.7; font-weight: normal; margin-left:2px;">Online</span>
            </div>
            <div class="status-item">
                <svg viewBox="0 0 300 300" style="width:16px; height:16px; fill:currentColor;"><use href="#svg-smile"></use></svg>
                <span>Engine</span>
                <span style="opacity: 0.7; font-weight: normal; margin-left:2px;">Online</span>
            </div>
        </div>"""
text = text.replace(old_bottom_statusbar, "")

# sidebar 3 empty replacement
old_sidebar_3 = """                    <div class="ws-list">
                        <div class="ws-item active">
                            <span>/do-what-new</span>
                            <span style="font-size:11px; color:var(--text-muted);">▼</span>
                        </div>
                        <div class="session-list">
                            <!-- No active session -->
                            <div style="padding: 8px; text-align:center;">
                                <button class="btn-ghost"
                                    style="width:100%; justify-content:center; border: 1px dashed var(--border-strong);">+
                                    New Session</button>
                            </div>
                        </div>
                        <div class="ws-item" style="margin-top:8px;">
                            <span>/project-alpha</span>
                            <span style="font-size:11px; color:var(--text-muted);">▶</span>
                        </div>

                        <div style="padding: 16px; text-align:center;">
                            <button class="btn-primary" style="width:100%; justify-content:center;">+ New
                                Workspace</button>
                        </div>
                    </div>
                </div>
            </div>"""
new_sidebar_3 = """                    <div class="ws-list">
                        <div class="ws-item active">
                            <span>/do-what-new</span>
                            <span style="font-size:11px; color:var(--text-muted);">▼</span>
                        </div>
                        <div class="session-list">
                            <!-- No active session -->
                            <div class="session-item" style="color:var(--accent-primary); margin-top:4px; font-weight:600; padding: 4px 10px; cursor:pointer;">
                                + New Run
                            </div>
                        </div>
                        <div class="ws-item" style="margin-top:8px;">
                            <span>/project-alpha</span>
                            <span style="font-size:11px; color:var(--text-muted);">▶</span>
                        </div>
                    </div>
                </div>
""" + sidebar_footer + """
            </div>"""
text = text.replace(old_sidebar_3, new_sidebar_3)

# Fix State 1 Label
text = text.replace("State 1: Active Session (Pi-pa Theme & Workspace Hierarchy)", "State 1: Active Session (Jin-xiang-yu Theme & Workspace Hierarchy)")

with open('UI/do-what-ui-preview.html', 'w', encoding='utf-8') as f:
    f.write(text)
print("Updated successfully")

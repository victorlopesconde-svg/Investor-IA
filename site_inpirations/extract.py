import re
import json
from bs4 import BeautifulSoup

def build_design_system(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')
    
    # Base structure
    doc = BeautifulSoup("<!DOCTYPE html><html lang='en'><head></head><body class='bg-[#0a0a0c] text-white'></body></html>", 'html.parser')
    
    # Copy head
    if soup.head:
        for child in soup.head.children:
            doc.head.append(child.__copy__())
            
    # Add DS specific styles
    ds_style = doc.new_tag('style')
    ds_style.string = """
    /* Design System Styles */
    .ds-nav {
        position: sticky; top: 0; z-index: 999999;
        background: rgba(10, 10, 12, 0.9);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255,255,255,0.1);
        display: flex; gap: 1rem; padding: 1rem 2rem;
        font-family: 'DM Sans', sans-serif;
        color: white; overflow-x: auto;
    }
    .ds-nav a {
        text-decoration: none; color: inherit; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500;
        padding: 0.5rem 1rem; border-radius: 999px; transition: background 0.2s;
    }
    .ds-nav a:hover { background: rgba(255,255,255,0.1); }
    
    .ds-section {
        padding: 6rem 2rem;
        max-width: 1400px;
        margin: 0 auto;
        color: white;
        font-family: 'DM Sans', sans-serif;
    }
    .ds-section-title {
        font-family: 'DM Serif Display', serif;
        font-size: 3rem;
        margin-bottom: 3rem;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        padding-bottom: 1rem;
    }
    
    .ds-row {
        display: flex; justify-content: space-between; align-items: flex-end;
        border-bottom: 1px dashed rgba(255,255,255,0.1);
        padding: 2rem 0;
    }
    .ds-col { display: flex; flex-direction: column; }
    .ds-label {
        font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 1rem;
    }
    .ds-typo-metrics { font-family: monospace; font-size: 0.875rem; color: rgba(255,255,255,0.7); }
    
    .ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 2rem; margin-bottom: 3rem; }
    .ds-swatch { height: 120px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center; }
    
    .ds-flex-center { display: flex; align-items: center; justify-content: center; gap: 1rem; flex-wrap: wrap; }
    
    .ds-comp-row { display: flex; gap: 2rem; align-items: center; }
    """
    doc.head.append(ds_style)
    
    if soup.body:
        doc.body.attrs = soup.body.attrs

    # 0) Top Nav
    nav_html = """
    <div class="ds-nav">
        <a href="#ds-hero">Hero</a>
        <a href="#ds-typography">Typography</a>
        <a href="#ds-colors">Colors & Surfaces</a>
        <a href="#ds-components">UI Components</a>
        <a href="#ds-layout">Layout & Spacing</a>
        <a href="#ds-motion">Motion & Interaction</a>
        <a href="#ds-icons">Icons</a>
    </div>
    """
    ds_nav = BeautifulSoup(nav_html, 'html.parser')
    doc.body.append(ds_nav)

    # 1) Hero Section
    main_el = soup.find('main')
    
    hero_section = doc.new_tag('section', id='ds-hero', style="position: relative;")
    
    original_nav = soup.find('nav')
    if original_nav:
        nav_c = original_nav.__copy__()
        # Ensure it acts relatively within hero
        classes = nav_c.get('class', [])
        classes = [c for c in classes if c not in ['fixed']]
        classes.append('absolute')
        nav_c['class'] = classes
        hero_section.append(nav_c)
        
    hero_inner = None
    if main_el:
        hero_inner = main_el.find('div', id='sticky-scene-container')
        if not hero_inner:
            hero_inner = main_el.find(True)
            
    if hero_inner:
        hero_c = hero_inner.__copy__()
        
        # Replace hero text
        h1s = hero_c.find_all('h1')
        if len(h1s) > 0:
            h1s[0].string = "Design System"
        if len(h1s) > 1:
            h1s[1].string = "Aura Protocol"
            
        ps = hero_c.find_all('p')
        if len(ps) > 0:
            ps[0].string = "The canonical reference for UI language, typography, and motion patterns."
        if len(ps) > 1:
            ps[1].string = "Master spatial computing design."
            
        hero_section.append(hero_c)
        
    doc.body.append(hero_section)
    
    # 2) Typography
    typo_section = BeautifulSoup("""
    <section id="ds-typography" class="ds-section">
        <h2 class="ds-section-title">Typography</h2>
        <div id="ds-typo-container"></div>
    </section>
    """, 'html.parser')
    typo_container = typo_section.find(id='ds-typo-container')
    
    def add_typo(label, el, sample_text):
        if not el: return
        el_c = el.__copy__()
        el_c.string = sample_text
        el_c.attrs['style'] = el_c.attrs.get('style', '')
        
        classes = el_c.get('class', [])
        classes = [c for c in classes if not any(c.startswith(p) for p in ['mt-', 'mb-', 'my-', 'm-', 'pt-', 'pb-', 'py-', 'p-', 'absolute', 'relative', 'w-', 'h-', 'flex', 'grid'])]
        el_c['class'] = classes
        
        row = BeautifulSoup(f"""
        <div class="ds-row">
            <div class="ds-col">
                <div class="ds-label">{label}</div>
                <div class="ds-typo-el-wrapper"></div>
            </div>
            <div class="ds-typo-metrics ds-col" style="text-align: right;"></div>
        </div>
        """, 'html.parser')
        row.find(class_='ds-typo-el-wrapper').append(el_c)
        typo_container.append(row)
        
    h1 = soup.find('h1')
    h2 = soup.find('h2')
    h3 = soup.find('h3')
    h4 = soup.find('h4')
    p = soup.find('p')
    
    # Heading 1, Heading 2, Heading 3, Heading 4, Bold L / Bold M / Bold S, Paragraph (larger body, if exists), Regular L / Regular M / Regular S
    
    add_typo("Heading 1", h1, "Aura Design System")
    add_typo("Heading 2", h2, "Immersive Realities")
    add_typo("Heading 3", h3, "Component Library")
    add_typo("Heading 4", h4, "Small Title")
    
    bold_l = soup.find(lambda tag: tag.name in ['div', 'span', 'p'] and any('text-xl' in c or 'text-2xl' in c for c in tag.get('class', [])) and any('font-bold' in c or 'font-semibold' in c or 'font-medium' in c for c in tag.get('class', [])))
    bold_m = soup.find(lambda tag: tag.name in ['div', 'span', 'p'] and any('text-lg' in c or 'text-base' in c for c in tag.get('class', [])) and any('font-bold' in c or 'font-semibold' in c or 'font-medium' in c for c in tag.get('class', [])))
    bold_s = soup.find(lambda tag: tag.name in ['div', 'span', 'p'] and any('text-sm' in c or 'text-xs' in c for c in tag.get('class', [])) and any('font-bold' in c or 'font-semibold' in c or 'font-medium' in c for c in tag.get('class', [])))
    
    add_typo("Bold L", bold_l, "The quick brown fox jumps over the lazy dog.")
    add_typo("Bold M", bold_m, "The quick brown fox jumps over the lazy dog.")
    add_typo("Bold S", bold_s, "The quick brown fox jumps over the lazy dog.")
    
    add_typo("Paragraph", p, "This paragraph demonstrates the body copy text sizing and line height structure.")
    
    reg_l = soup.find(lambda tag: tag.name in ['div', 'span', 'p'] and any('text-xl' in c or 'text-2xl' in c for c in tag.get('class', [])) and not any('font-bold' in c or 'font-semibold' in c or 'font-medium' in c for c in tag.get('class', [])))
    reg_m = soup.find(lambda tag: tag.name in ['div', 'span', 'p'] and any('text-lg' in c or 'text-base' in c for c in tag.get('class', [])) and not any('font-bold' in c or 'font-semibold' in c or 'font-medium' in c for c in tag.get('class', [])))
    reg_s = soup.find(lambda tag: tag.name in ['div', 'span', 'p'] and any('text-sm' in c or 'text-xs' in c for c in tag.get('class', [])) and not any('font-bold' in c or 'font-semibold' in c or 'font-medium' in c for c in tag.get('class', [])))

    add_typo("Regular L", reg_l, "The quick brown fox jumps over the lazy dog.")
    add_typo("Regular M", reg_m, "The quick brown fox jumps over the lazy dog.")
    add_typo("Regular S", reg_s, "The quick brown fox jumps over the lazy dog.")
    
    doc.body.append(typo_section)
    
    # 3) Colors & Surfaces
    color_section = BeautifulSoup("""
    <section id="ds-colors" class="ds-section">
        <h2 class="ds-section-title">Colors & Surfaces</h2>
        <div class="ds-label">Backgrounds & Surfaces</div>
        <div class="ds-grid" id="ds-color-bg"></div>
        <div class="ds-label">Borders & Dividers</div>
        <div class="ds-grid" id="ds-color-border"></div>
        <div class="ds-label">Gradients & Blurs</div>
        <div class="ds-grid" id="ds-color-grad"></div>
    </section>
    """, 'html.parser')
    
    bgs = set()
    borders = set()
    grads = set()
    blurs = set()
    
    for tag in soup.find_all(True):
        classes = tag.get('class', [])
        for c in classes:
            if c.startswith('bg-') and not c.startswith('bg-url') and 'gradient' not in c:
                bgs.add(c)
            elif c.startswith('border-') and len(c) > 7 and not c.startswith('border-t') and not c.startswith('border-b') and not c.startswith('border-l') and not c.startswith('border-r'):
                borders.add(c)
            elif 'gradient' in c:
                grads.add(c)
            elif 'blur' in c:
                blurs.add(c)
                
    def add_swatches(container_id, items, extra_classes=""):
        container = color_section.find(id=container_id)
        for item in sorted(items):
            if 'transparent' in item or 'opacity' in item: continue
            swatch_html = f"""
            <div class="ds-col">
                <div class="ds-swatch {item} {extra_classes}"></div>
                <div class="ds-label">{item}</div>
            </div>
            """
            container.append(BeautifulSoup(swatch_html, 'html.parser'))
            
    add_swatches("ds-color-bg", bgs)
    add_swatches("ds-color-border", borders, "border bg-black")
    add_swatches("ds-color-grad", grads.union(blurs), "w-full h-full bg-white/10")
    
    doc.body.append(color_section)

    # 4) UI Components
    comp_section = BeautifulSoup("""
    <section id="ds-components" class="ds-section">
        <h2 class="ds-section-title">UI Components</h2>
        <div id="ds-comp-container"></div>
    </section>
    """, 'html.parser')
    
    comp_container = comp_section.find(id='ds-comp-container')
    
    # Extract unique buttons
    seen_btns = set()
    for btn in soup.find_all(['button', 'a', 'input']):
        if btn.name == 'input':
            row = BeautifulSoup(f"""
            <div class="ds-row">
                <div class="ds-col">
                    <div class="ds-label">Input</div>
                    <div class="ds-comp-default"></div>
                </div>
            </div>
            """, 'html.parser')
            row.find(class_='ds-comp-default').append(btn.__copy__())
            comp_container.append(row)
            continue
            
        classes = btn.get('class', [])
        class_str = ' '.join(classes)
        if 'hover:' in class_str or 'bg-' in class_str or 'border' in class_str or 'w-' in class_str:
            if class_str not in seen_btns and len(seen_btns) < 10:
                seen_btns.add(class_str)
                btn_c = btn.__copy__()
                if not btn_c.text.strip() and not btn_c.find(True):
                    btn_c.string = "Button"
                
                # Show states side by side
                # We do this by creating a disabled one as well
                btn_disabled = btn_c.__copy__()
                btn_disabled['disabled'] = 'true'
                btn_disabled['class'] = btn_disabled.get('class', []) + ['opacity-50', 'cursor-not-allowed']
                
                row_html = f"""
                <div class="ds-row" style="flex-direction:column; align-items:flex-start; gap:1rem;">
                    <div class="ds-label">{" ".join(classes)}</div>
                    <div class="ds-comp-row">
                        <div class="ds-col">
                            <div class="ds-label" style="font-size:0.65rem; color:#888;">Default / Hover / Active</div>
                            <div class="ds-comp-default"></div>
                        </div>
                        <div class="ds-col">
                            <div class="ds-label" style="font-size:0.65rem; color:#888;">Disabled</div>
                            <div class="ds-comp-disabled"></div>
                        </div>
                    </div>
                </div>
                """
                row = BeautifulSoup(row_html, 'html.parser')
                row.find(class_='ds-comp-default').append(btn_c)
                row.find(class_='ds-comp-disabled').append(btn_disabled)
                comp_container.append(row)
                
    doc.body.append(comp_section)
    
    # 5) Layout & Spacing
    layout_section = BeautifulSoup("""
    <section id="ds-layout" class="ds-section">
        <h2 class="ds-section-title">Layout & Spacing</h2>
        <p class="mb-8 opacity-70">Containers, Grids, and Columns extracted from the page structure.</p>
        <div id="ds-layout-container"></div>
    </section>
    """, 'html.parser')
    
    layout_container = layout_section.find(id='ds-layout-container')
    
    # Find grid containers
    grids = soup.find_all(lambda tag: tag.name == 'div' and 'grid' in tag.get('class', []))
    for g in grids[:3]:
        grid_c = g.__copy__()
        # Clean contents to show layout
        grid_c.clear()
        for i in range(4):
            item = doc.new_tag('div', **{'class': 'bg-white/10 p-4 border border-white/20 text-center rounded'})
            item.string = f"Grid Item {i+1}"
            grid_c.append(item)
            
        row = BeautifulSoup(f"""
        <div class="ds-row" style="flex-direction: column; align-items: flex-start; width: 100%;">
            <div class="ds-label">{" ".join(g.get('class', []))}</div>
            <div class="ds-layout-grid-wrap" style="width: 100%;"></div>
        </div>
        """, 'html.parser')
        row.find(class_='ds-layout-grid-wrap').append(grid_c)
        layout_container.append(row)
        
    doc.body.append(layout_section)

    # 6) Motion & Interaction
    motion_section = BeautifulSoup("""
    <section id="ds-motion" class="ds-section">
        <h2 class="ds-section-title">Motion & Interaction</h2>
        <div class="ds-grid" id="ds-motion-container"></div>
    </section>
    """, 'html.parser')
    
    motion_container = motion_section.find(id='ds-motion-container')
    
    motions = set()
    for tag in soup.find_all(True):
        classes = tag.get('class', [])
        for c in classes:
            if c.startswith('animate-') or c.startswith('transition') or c.startswith('duration-') or c.startswith('delay-') or 'hover:' in c:
                motions.add(c)
                
    for m in sorted(motions)[:20]:
        m_html = f"""
        <div class="ds-col">
            <div class="ds-swatch bg-white/5 border border-white/10 {m} cursor-pointer hover:bg-white/20">{m}</div>
        </div>
        """
        motion_container.append(BeautifulSoup(m_html, 'html.parser'))
        
    doc.body.append(motion_section)
    
    # 7) Icons
    icon_section = BeautifulSoup("""
    <section id="ds-icons" class="ds-section">
        <h2 class="ds-section-title">Icons</h2>
        <div class="ds-grid" id="ds-icon-container"></div>
    </section>
    """, 'html.parser')
    
    icon_container = icon_section.find(id='ds-icon-container')
    
    icons = soup.find_all('iconify-icon')
    if not icons:
        icons = soup.find_all('i', {'data-lucide': True})
        
    if icons:
        seen = set()
        for i in icons:
            name = i.get('icon') or i.get('data-lucide')
            if name and name not in seen:
                seen.add(name)
                i_c = i.__copy__()
                if i_c.name == 'iconify-icon':
                    i_c['width'] = '48'
                elif i_c.name == 'i':
                    classes = [c for c in i_c.get('class', []) if not c.startswith('w-') and not c.startswith('h-')]
                    classes.extend(['w-12', 'h-12'])
                    i_c['class'] = classes
                
                c_html = f"""
                <div class="ds-col ds-flex-center p-4 bg-white/5 border border-white/10 rounded">
                    <div class="ds-icon-wrap text-white"></div>
                    <div class="ds-label" style="margin:0; text-transform:none;">{name}</div>
                </div>
                """
                c_soup = BeautifulSoup(c_html, 'html.parser')
                c_soup.find(class_='ds-icon-wrap').append(i_c)
                icon_container.append(c_soup)
                
    doc.body.append(icon_section)
    
    # Inject JS for typo metrics
    js = doc.new_tag('script')
    js.string = """
    document.addEventListener('DOMContentLoaded', () => {
        const typoRows = document.querySelectorAll('#ds-typography .ds-row');
        typoRows.forEach(row => {
            const el = row.querySelector('.ds-typo-el-wrapper').firstElementChild;
            const metrics = row.querySelector('.ds-typo-metrics');
            if (el && metrics) {
                const style = window.getComputedStyle(el);
                const size = style.fontSize;
                const lh = style.lineHeight;
                metrics.textContent = `${size} / ${lh}`;
            }
        });
    });
    """
    doc.body.append(js)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(str(doc))

if __name__ == '__main__':
    build_design_system('d:/Meu Investimento/site_inpirations/aura.html', 'd:/Meu Investimento/site_inpirations/design-system.html')

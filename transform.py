import re

def process():
    file_path = "src/app/driver/onboarding/page.jsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Layout changes
    content = content.replace('<main className="bg-charcoal-50 min-h-screen pt-20 pb-12">', '<div className="min-h-full pt-6 pb-12">')
    content = content.replace('</main>', '</div>')
    
    # Progress bars
    content = content.replace("bg-emerald-500' : 'bg-gray-200'", "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-charcoal-800'")
    content = content.replace('mb-8">', 'mb-8 mt-2">')

    # Step 1 headers
    content = content.replace('text-3xl font-black text-charcoal-900 mb-2', 'text-3xl font-black text-white mb-2')
    content = content.replace('p className="text-charcoal-500 font-medium mb-8"', 'p className="text-charcoal-400 font-medium mb-8"')

    # Grid buttons
    content = content.replace("? 'border-emerald-500 bg-emerald-50'", "? 'border-emerald-500 bg-emerald-500/10'")
    content = content.replace(": 'border-white bg-white hover:border-gray-200 shadow-sm'", ": 'border-charcoal-800 bg-charcoal-800 hover:border-charcoal-700 shadow-sm'")
    content = content.replace("? 'bg-emerald-500 text-white'", "? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'")
    content = content.replace(": 'bg-gray-100 text-charcoal-500'", ": 'bg-charcoal-700 text-charcoal-300'")
    content = content.replace('span className="font-bold text-charcoal-900"', 'span className="font-bold text-white"')

    # Inputs
    content = content.replace('className="w-full bg-white border-2 border-transparent focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-charcoal-900 shadow-sm transition-all outline-none mb-6"', 'className="w-full bg-charcoal-800 border-2 border-charcoal-800 focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-white shadow-sm transition-all outline-none mb-6 placeholder:text-charcoal-600"')
    content = content.replace('className="w-full bg-white border-2 border-transparent focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-charcoal-900 shadow-sm transition-all outline-none"', 'className="w-full bg-charcoal-800 border-2 border-charcoal-800 focus:border-emerald-500 px-6 py-4 rounded-2xl font-bold text-white shadow-sm transition-all outline-none placeholder:text-charcoal-600"')

    # Email
    content = content.replace('className="w-full bg-gray-100 border-2 border-gray-100 px-6 py-4 rounded-2xl font-bold text-charcoal-500 shadow-sm transition-all mb-4 flex items-center gap-3"', 'className="w-full bg-charcoal-800/50 border-2 border-charcoal-800 px-6 py-4 rounded-2xl font-bold text-charcoal-400 shadow-sm transition-all mb-4 flex items-center gap-3"')

    # Step 1 Next
    content = content.replace('w-full py-5 bg-charcoal-900 hover:bg-black text-white font-black rounded-2xl shadow-xl shadow-black/20', 'w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20')

    # Step 2 Headers
    content = content.replace('text-charcoal-500 font-bold text-sm mb-4 hover:text-charcoal-900', 'text-charcoal-400 font-bold text-sm mb-4 hover:text-white transition-colors')

    # Step 2 Cards
    content = content.replace("bg-white p-6 rounded-[2rem]", "bg-charcoal-800 p-6 rounded-[2rem]")
    content = content.replace("border-red-200 bg-red-50/10", "border-red-500/50 bg-red-500/10")
    content = content.replace("border-emerald-500 bg-emerald-50/20", "border-emerald-500 bg-emerald-500/10")
    content = content.replace("border-gray-100", "border-charcoal-700")

    # Step 2 Icons
    content = content.replace("bg-red-100 text-red-600", "bg-red-500/20 text-red-400")
    content = content.replace("bg-blue-50 text-blue-600", "bg-emerald-500/20 text-emerald-400")
    content = content.replace("bg-purple-50 text-purple-600", "bg-emerald-500/20 text-emerald-400")

    content = content.replace('h3 className="font-bold text-charcoal-900"', 'h3 className="font-bold text-white"')
    content = content.replace('p className="text-xs text-charcoal-500 font-medium"', 'p className="text-xs text-charcoal-400 font-medium"')

    # Step 2 Upload Labels
    content = content.replace('bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:bg-gray-100', 'bg-charcoal-900 border-2 border-dashed border-charcoal-700 rounded-2xl overflow-hidden cursor-pointer hover:border-emerald-500/50 hover:bg-charcoal-900/80')

    # Step 2 OR Divider
    content = content.replace('bg-gray-200', 'bg-charcoal-700')
    content = re.sub(r'span className="text-\[10px\] font-black text-charcoal-400 uppercase tracking-widest">OR</span>', r'span className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest">OR</span>', content)

    # Step 3
    content = content.replace('text-4xl font-black text-charcoal-900 mb-4', 'text-4xl font-black text-white mb-4')
    content = content.replace('text-charcoal-500 font-medium text-lg mb-10', 'text-charcoal-400 font-medium text-lg mb-10')
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

process()

/**
 * CMT curriculum outline used on /cmt and the CMT Level I and II programme pages: each section of the
 * curriculum with its sub-sections (chapters), in the CMT Association's order, numbers removed.
 */
export type CmtSection = [section: string, chapters: string[]];

export const CMT_CURRICULUM: Record<"cmt-level-1" | "cmt-level-2", { level: string; sections: CmtSection[] }> = {
  "cmt-level-1": { level: "Level I", sections: [
    ["Theory and History of Technical Analysis", ["A Brief History of Technical Analysis", "The Dow Theory", "Markets, Instruments, Data and the Technical Analyst", "The Opportunity of the Efficient Markets Hypothesis", "The Fibonacci Sequence and The Golden Ratio"]],
    ["Charts: Market Price Data", ["An Overview of Charting", "The X Axis", "The Y Axis", "Charting Volume and Open Interest"]],
    ["Trend Analysis", ["Trend Primer: What is a Trend", "Trend Primer: A Trend's Four Phases", "Trend Primer: Trend Identification and Following", "Introduction to Volume Analysis", "Volume, Open Interest, and Price", "Market Internals"]],
    ["Chart Pattern Analysis", ["Classical Chart Patterns", "Introduction to Candlesticks", "Introduction to Candlestick Patterns", "Basics of Point-and-Figure Charting"]],
    ["Technical Indicators", ["Moving Averages", "Technical Indicator Construction", "Introduction to Bollinger Bands"]],
    ["Statistics for Technicians", ["Introduction to Statistics Part 1", "Introduction to Statistics Part 2", "Introduction to Probability"]],
    ["Behavioral Finance", ["Behavioral Finance"]],
    ["Sentiment", ["Market Sentiment and Technical Analysis", "Sentiment Measured from Market Data", "Sentiment Measured from External Data"]],
    ["Cycle Analysis", ["Foundations of Cycle Theory", "Common Cycles"]],
    ["Comparative Market Analysis", ["Equities", "Indexes", "Fixed Income/Bonds", "Futures", "Exchange-Traded Products (ETPs)", "Foreign Exchange (Currencies)", "Digital Assets", "Options", "Introduction to Relative Strength", "Relative Strength and its Uses"]],
    ["Volatility Analysis", ["The Meaning of Volatility to a Technician", "Measuring Historical Volatility", "Options Derived Volatility"]],
    ["Systems and Quantitative Methods", ["Introduction to Quantitative Methods"]],
  ] },
  "cmt-level-2": { level: "Level II", sections: [
    ["Theory and History of Technical Analysis", ["Alpha and Beta - Outperforming the Benchmarks", "Fusion Analysis: Technical Analysis as Part of a Team Approach"]],
    ["Behavioural Finance", ["Anatomy of Market Bubbles"]],
    ["Charts: Organizing Market Data", ["Charting Multiple Data Sets and Multiple Data Intervals", "Market Profile"]],
    ["Chart Pattern Analysis", ["Classical Chart Patterns", "Candlestick Patterns in the Real World", "Candlestick Analysis in the Real World", "Point-and-Figure Pattern Analysis"]],
    ["Trend Analysis", ["Price Trend and Volume", "Market Internals"]],
    ["Volatility Analysis", ["Extrapolating Price from Volatility", "Volatility Risk Premium", "Volatility Indexes and VIX Complex"]],
    ["Sentiment", ["Analysing Sentiment in the Stock Market", "Analyzing Sentiment in the Derivatives Market"]],
    ["Statistics for Technicians", ["Inferential Statistics"]],
    ["Technical Indicators", ["Momentum and Indicator Interpretation Part 1", "Momentum and Indicator Interpretation Part 2", "Volume Weighted Average Price", "Practical Applications of Bollinger Bands"]],
    ["Comparative Market Analysis", ["Advanced Applications of Relative Strength"]],
    ["Cycle Analysis", ["Concepts in Cycle Theory", "Applied Cycle Analysis", "Analysis of Seasonal Cycles", "The Elliott Wave Principle Part 1", "The Elliott Wave Principle Part 2", "The Elliott Wave Principle Part 3"]],
    ["Systems and Quantitative Methods", ["Trading Systems", "Applying Quantitative Techniques"]],
  ] },
};

export const cmtCurriculumFor = (slug: string) => (slug in CMT_CURRICULUM ? CMT_CURRICULUM[slug as keyof typeof CMT_CURRICULUM] : null);

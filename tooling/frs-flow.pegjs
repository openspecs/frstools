// FRS Flow Grammar v1.1.1
// Parsing Expression Grammar for the Flow section of
// Fullstack Requirement Specification documents
// https://github.com/openspecs/frs

{
  function buildStep(num, action, alternatives) {
    return {
      step: parseInt(num, 10),
      action: action.trim(),
      alternatives: alternatives || []
    };
  }

  function buildAlternative(condition, action) {
    return {
      condition: condition.trim(),
      action: action.trim()
    };
  }

  function buildTechnical(type, content) {
    return {
      type: type.trim().replace(":", ""),
      content: content.trim()
    };
  }
}

Document
  = _ flow:Flow _ technical:TechnicalSection* _ validate:ValidateSection? _ {
      return { flow: flow, technical: technical, validate: validate || null };
    }

// --- Flow ---

Flow
  = "Flow:" _ steps:Step+ {
      return steps;
    }

Step
  = _ num:Number "." Space+ action:TextLine NewLine? alts:Alternative* {
      return buildStep(num, action, alts);
    }

Alternative
  = Space Space "- " condition:Condition ": " action:TextLine NewLine? {
      return buildAlternative(condition, action);
    }

Condition
  = $( ("If" / "When" / "On error" / "On timeout" / "On success") [^:]* )

// --- Technical Sections ---

TechnicalSection
  = _ type:TechnicalKeyword Space* content:TextLine NewLine? {
      return buildTechnical(type, content);
    }

TechnicalKeyword
  = $( ("API:" / "Performance:" / "Security:" / "Data:" / "Rule:") )

// --- Validate Section ---

ValidateSection
  = "Validate:" body:$( (NewLine / [^\n\r])* ) {
      return body;
    }

// --- Primitives ---

Number
  = $[0-9]+

TextLine
  = $[^\n\r]+

Space
  = " "

NewLine
  = "\r\n" / "\n" / "\r"

_
  = [ \t\n\r]*

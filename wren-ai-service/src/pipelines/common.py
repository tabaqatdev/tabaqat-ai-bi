import re
from typing import Any, List, Optional, Tuple

from haystack import Document, component


def get_engine_supported_data_type(data_type: str) -> str:
    """
    This function makes sure downstream ai pipeline get column data types in a format that is supported by the data engine.
    """
    match data_type.upper():
        case "BPCHAR" | "NAME" | "UUID" | "INET":
            return "VARCHAR"
        case "OID":
            return "INT"
        case "BIGNUMERIC":
            return "NUMERIC"
        case "BYTES":
            return "BYTEA"
        case "DATETIME":
            return "TIMESTAMP"
        case "FLOAT64":
            return "DOUBLE"
        case "INT64":
            return "BIGINT"
        case "GEOMETRY" | "GEOGRAPHY" | "POINT" | "LINESTRING" | "POLYGON" | "MULTIPOINT" | "MULTILINESTRING" | "MULTIPOLYGON" | "GEOMETRYCOLLECTION":
            return "GEOMETRY"
        case _:
            return data_type.upper()


# List of geometry types for PostGIS support
GEOMETRY_TYPES = {
    "geometry", "geography", "point", "linestring", "polygon",
    "multipoint", "multilinestring", "multipolygon", "geometrycollection"
}


def is_geometry_type(data_type: str) -> bool:
    """Check if the data type is a geometry/PostGIS type."""
    return data_type.lower() in GEOMETRY_TYPES


def build_table_ddl(
    content: dict, columns: Optional[set[str]] = None, tables: Optional[set[str]] = None
) -> Tuple[str, bool, bool, bool]:
    columns_ddl = []
    has_calculated_field = False
    has_json_field = False
    has_geometry_field = False

    for column in content["columns"]:
        if column["type"] == "COLUMN":
            data_type_lower = column["data_type"].lower()
            # Allow geometry types even if they might appear as unknown in some cases
            is_geometry = is_geometry_type(data_type_lower)
            if (
                (not columns or (columns and column["name"] in columns))
                and (data_type_lower != "unknown" or is_geometry)
            ):
                if "This column is a Calculated Field" in column["comment"]:
                    has_calculated_field = True
                if data_type_lower == "json":
                    has_json_field = True
                if is_geometry:
                    has_geometry_field = True
                column_ddl = f"{column['comment']}{column['name']} {get_engine_supported_data_type(column['data_type'])}"
                if column["is_primary_key"]:
                    column_ddl += " PRIMARY KEY"
                columns_ddl.append(column_ddl)
        elif column["type"] == "FOREIGN_KEY":
            if not tables or (tables and set(column["tables"]).issubset(tables)):
                columns_ddl.append(f"{column['comment']}{column['constraint']}")

    return (
        (
            f"{content['comment']}CREATE TABLE {content['name']} (\n  "
            + ",\n  ".join(columns_ddl)
            + "\n);"
        ),
        has_calculated_field,
        has_json_field,
        has_geometry_field,
    )


async def retrieve_metadata(project_id: str, retriever) -> dict[str, Any]:
    filters = None
    if project_id:
        filters = {
            "operator": "AND",
            "conditions": [
                {"field": "project_id", "operator": "==", "value": project_id},
            ],
        }

    result = await retriever.run(query_embedding=[], filters=filters)
    documents = result["documents"]

    # only one document for a project, thus we can return the first one
    if documents:
        doc = documents[0]
        return doc.meta
    else:
        return {}


@component
class ScoreFilter:
    @component.output_types(
        documents=List[Document],
    )
    def run(
        self,
        documents: List[Document],
        score: float = 0.9,
        max_size: int = 10,
    ):
        return {
            "documents": sorted(
                filter(lambda document: document.score >= score, documents),
                key=lambda document: document.score,
                reverse=True,
            )[:max_size]
        }


MULTIPLE_NEW_LINE_REGEX = re.compile(r"\n{3,}")


def clean_up_new_lines(text: str) -> str:
    return MULTIPLE_NEW_LINE_REGEX.sub("\n\n\n", text)
